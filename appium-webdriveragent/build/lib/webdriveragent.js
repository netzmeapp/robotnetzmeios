"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WebDriverAgent = exports.default = void 0;

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _path = _interopRequireDefault(require("path"));

var _url2 = _interopRequireDefault(require("url"));

var _bluebird = _interopRequireDefault(require("bluebird"));

var _appiumBaseDriver = require("appium-base-driver");

var _appiumSupport = require("appium-support");

var _logger = _interopRequireDefault(require("./logger"));

var _noSessionProxy = require("./no-session-proxy");

var _utils = require("./utils");

var _xcodebuild = _interopRequireDefault(require("./xcodebuild"));

var _teen_process = require("teen_process");

var _asyncLock = _interopRequireDefault(require("async-lock"));

var _checkDependencies = require("./check-dependencies");

var _constants = require("./constants");

const WDA_LAUNCH_TIMEOUT = 60 * 1000;
const WDA_AGENT_PORT = 8100;
const WDA_CF_BUNDLE_NAME = 'WebDriverAgentRunner-Runner';
const SHARED_RESOURCES_GUARD = new _asyncLock.default();

class WebDriverAgent {
  constructor(xcodeVersion, args = {}) {
    this.xcodeVersion = xcodeVersion;
    this.args = _lodash.default.clone(args);
    this.device = args.device;
    this.platformVersion = args.platformVersion;
    this.platformName = args.platformName;
    this.iosSdkVersion = args.iosSdkVersion;
    this.host = args.host;
    this.isRealDevice = !!args.realDevice;
    this.idb = (args.device || {}).idb;
    this.setWDAPaths(args.bootstrapPath, args.agentPath);
    this.wdaLocalPort = args.wdaLocalPort;
    this.wdaRemotePort = args.wdaLocalPort || WDA_AGENT_PORT;
    this.wdaBaseUrl = args.wdaBaseUrl || _constants.WDA_BASE_URL;
    this.prebuildWDA = args.prebuildWDA;
    this.webDriverAgentUrl = args.webDriverAgentUrl;
    this.started = false;
    this.wdaConnectionTimeout = args.wdaConnectionTimeout;
    this.useCarthageSsl = _lodash.default.isBoolean(args.useCarthageSsl) && args.useCarthageSsl;
    this.useXctestrunFile = args.useXctestrunFile;
    this.usePrebuiltWDA = args.usePrebuiltWDA;
    this.derivedDataPath = args.derivedDataPath;
    this.mjpegServerPort = args.mjpegServerPort;
    this.updatedWDABundleId = args.updatedWDABundleId;
    this.xcodebuild = new _xcodebuild.default(this.xcodeVersion, this.device, {
      platformVersion: this.platformVersion,
      platformName: this.platformName,
      iosSdkVersion: this.iosSdkVersion,
      agentPath: this.agentPath,
      bootstrapPath: this.bootstrapPath,
      realDevice: this.isRealDevice,
      showXcodeLog: args.showXcodeLog,
      xcodeConfigFile: args.xcodeConfigFile,
      xcodeOrgId: args.xcodeOrgId,
      xcodeSigningId: args.xcodeSigningId,
      keychainPath: args.keychainPath,
      keychainPassword: args.keychainPassword,
      useSimpleBuildTest: args.useSimpleBuildTest,
      usePrebuiltWDA: args.usePrebuiltWDA,
      updatedWDABundleId: this.updatedWDABundleId,
      launchTimeout: args.wdaLaunchTimeout || WDA_LAUNCH_TIMEOUT,
      wdaRemotePort: this.wdaRemotePort,
      useXctestrunFile: this.useXctestrunFile,
      derivedDataPath: args.derivedDataPath,
      mjpegServerPort: this.mjpegServerPort
    });
  }

  setWDAPaths(bootstrapPath, agentPath) {
    this.bootstrapPath = bootstrapPath || _constants.BOOTSTRAP_PATH;

    _logger.default.info(`Using WDA path: '${this.bootstrapPath}'`);

    this.agentPath = agentPath || _path.default.resolve(this.bootstrapPath, 'WebDriverAgent.xcodeproj');

    _logger.default.info(`Using WDA agent: '${this.agentPath}'`);
  }

  async cleanupObsoleteProcesses() {
    const obsoletePids = await (0, _utils.getPIDsListeningOnPort)(this.url.port, cmdLine => cmdLine.includes('/WebDriverAgentRunner') && !cmdLine.toLowerCase().includes(this.device.udid.toLowerCase()));

    if (_lodash.default.isEmpty(obsoletePids)) {
      _logger.default.debug(`No obsolete cached processes from previous WDA sessions ` + `listening on port ${this.url.port} have been found`);

      return;
    }

    _logger.default.info(`Detected ${obsoletePids.length} obsolete cached process${obsoletePids.length === 1 ? '' : 'es'} ` + `from previous WDA sessions. Cleaning them up`);

    try {
      await (0, _teen_process.exec)('kill', obsoletePids);
    } catch (e) {
      _logger.default.warn(`Failed to kill obsolete cached process${obsoletePids.length === 1 ? '' : 'es'} '${obsoletePids}'. ` + `Original error: ${e.message}`);
    }
  }

  async isRunning() {
    return !!(await this.getStatus());
  }

  get basePath() {
    if (this.url.path === '/') {
      return '';
    }

    return this.url.path || '';
  }

  async getStatus() {
    const noSessionProxy = new _noSessionProxy.NoSessionProxy({
      server: this.url.hostname,
      port: this.url.port,
      base: this.basePath,
      timeout: 3000
    });

    try {
      return await noSessionProxy.command('/status', 'GET');
    } catch (err) {
      _logger.default.debug(`WDA is not listening at '${this.url.href}'`);

      return null;
    }
  }

  async uninstall() {
    try {
      const bundleIds = await this.device.getUserInstalledBundleIdsByBundleName(WDA_CF_BUNDLE_NAME);

      if (_lodash.default.isEmpty(bundleIds)) {
        _logger.default.debug('No WDAs on the device.');

        return;
      }

      _logger.default.debug(`Uninstalling WDAs: '${bundleIds}'`);

      for (const bundleId of bundleIds) {
        await this.device.removeApp(bundleId);
      }
    } catch (e) {
      _logger.default.debug(e);

      _logger.default.warn(`WebDriverAgent uninstall failed. Perhaps, it is already uninstalled? ` + `Original error: ${e.message}`);
    }
  }

  async launch(sessionId) {
    if (this.webDriverAgentUrl) {
      _logger.default.info(`Using provided WebdriverAgent at '${this.webDriverAgentUrl}'`);

      this.url = this.webDriverAgentUrl;
      this.setupProxies(sessionId);
      return await this.getStatus();
    }

    _logger.default.info('Launching WebDriverAgent on the device');

    this.setupProxies(sessionId);

    if (!this.useXctestrunFile && !(await _appiumSupport.fs.exists(this.agentPath))) {
      throw new Error(`Trying to use WebDriverAgent project at '${this.agentPath}' but the ` + 'file does not exist');
    }

    if (this.idb || this.useXctestrunFile || this.derivedDataPath && this.usePrebuiltWDA) {
      _logger.default.info('Skipped WDA dependencies resolution according to the provided capabilities');
    } else {
      const synchronizationKey = _path.default.normalize(this.bootstrapPath);

      await SHARED_RESOURCES_GUARD.acquire(synchronizationKey, async () => {
        const didPerformUpgrade = await (0, _checkDependencies.checkForDependencies)({
          useSsl: this.useCarthageSsl
        });

        if (didPerformUpgrade) {
          await this.xcodebuild.cleanProject();
        }
      });
    }

    await (0, _utils.resetTestProcesses)(this.device.udid, !this.isRealDevice);

    if (this.idb) {
      return await this.startWithIDB();
    }

    await this.xcodebuild.init(this.noSessionProxy);

    if (this.prebuildWDA) {
      await this.xcodebuild.prebuild();
    }

    return await this.xcodebuild.start();
  }

  async startWithIDB() {
    _logger.default.info('Will launch WDA with idb instead of xcodebuild since the corresponding flag is enabled');

    const {
      wdaBundleId,
      testBundleId
    } = await this.prepareWDA();
    const env = {
      USE_PORT: this.wdaRemotePort,
      WDA_PRODUCT_BUNDLE_IDENTIFIER: this.updatedWDABundleId
    };

    if (this.mjpegServerPort) {
      env.MJPEG_SERVER_PORT = this.mjpegServerPort;
    }

    return await this.idb.runXCUITest(wdaBundleId, wdaBundleId, testBundleId, {
      env
    });
  }

  async parseBundleId(wdaBundlePath) {
    const infoPlistPath = _path.default.join(wdaBundlePath, 'Info.plist');

    const infoPlist = await _appiumSupport.plist.parsePlist(await _appiumSupport.fs.readFile(infoPlistPath));

    if (!infoPlist.CFBundleIdentifier) {
      throw new Error(`Could not find bundle id in '${infoPlistPath}'`);
    }

    return infoPlist.CFBundleIdentifier;
  }

  async prepareWDA() {
    const wdaBundlePath = await this.fetchWDABundle();
    const wdaBundleId = await this.parseBundleId(wdaBundlePath);

    if (!(await this.device.isAppInstalled(wdaBundleId))) {
      await this.device.installApp(wdaBundlePath);
    }

    const testBundleId = await this.idb.installXCTestBundle(_path.default.join(wdaBundlePath, 'PlugIns', 'WebDriverAgentRunner.xctest'));
    return {
      wdaBundleId,
      testBundleId,
      wdaBundlePath
    };
  }

  async fetchWDABundle() {
    if (!this.derivedDataPath) {
      return await (0, _checkDependencies.bundleWDASim)(this.xcodebuild);
    }

    const wdaBundlePaths = await _appiumSupport.fs.glob(`${this.derivedDataPath}/**/*${_constants.WDA_RUNNER_APP}/`, {
      absolute: true
    });

    if (_lodash.default.isEmpty(wdaBundlePaths)) {
      throw new Error(`Could not find the WDA bundle in '${this.derivedDataPath}'`);
    }

    return wdaBundlePaths[0];
  }

  async isSourceFresh() {
    const existsPromises = [_constants.CARTHAGE_ROOT, 'Resources', `Resources${_path.default.sep}WebDriverAgent.bundle`].map(subPath => _appiumSupport.fs.exists(_path.default.resolve(this.bootstrapPath, subPath)));
    return (await _bluebird.default.all(existsPromises)).some(v => v === false);
  }

  setupProxies(sessionId) {
    const proxyOpts = {
      server: this.url.hostname,
      port: this.url.port,
      base: this.basePath,
      timeout: this.wdaConnectionTimeout,
      keepAlive: true
    };
    this.jwproxy = new _appiumBaseDriver.JWProxy(proxyOpts);
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);
    this.noSessionProxy = new _noSessionProxy.NoSessionProxy(proxyOpts);
  }

  async quit() {
    _logger.default.info('Shutting down sub-processes');

    await this.xcodebuild.quit();
    await this.xcodebuild.reset();

    if (this.jwproxy) {
      this.jwproxy.sessionId = null;
    }

    this.started = false;

    if (!this.args.webDriverAgentUrl) {
      this.webDriverAgentUrl = null;
    }
  }

  get url() {
    if (!this._url) {
      if (this.webDriverAgentUrl) {
        this._url = _url2.default.parse(this.webDriverAgentUrl);
      } else {
        const port = this.wdaLocalPort || WDA_AGENT_PORT;

        const {
          protocol,
          hostname
        } = _url2.default.parse(this.wdaBaseUrl || _constants.WDA_BASE_URL);

        this._url = _url2.default.parse(`${protocol}//${hostname}:${port}`);
      }
    }

    return this._url;
  }

  set url(_url) {
    this._url = _url2.default.parse(_url);
  }

  get fullyStarted() {
    return this.started;
  }

  set fullyStarted(started = false) {
    this.started = started;
  }

  async retrieveDerivedDataPath() {
    return await this.xcodebuild.retrieveDerivedDataPath();
  }

  async setupCaching() {
    const status = await this.getStatus();

    if (!status || !status.build) {
      _logger.default.debug('WDA is currently not running. There is nothing to cache');

      return;
    }

    const {
      productBundleIdentifier,
      upgradedAt
    } = status.build;

    if (_appiumSupport.util.hasValue(productBundleIdentifier) && _appiumSupport.util.hasValue(this.updatedWDABundleId) && this.updatedWDABundleId !== productBundleIdentifier) {
      _logger.default.info(`Will uninstall running WDA since it has different bundle id. The actual value is '${productBundleIdentifier}'.`);

      return await this.uninstall();
    }

    if (_appiumSupport.util.hasValue(productBundleIdentifier) && !_appiumSupport.util.hasValue(this.updatedWDABundleId) && _constants.WDA_RUNNER_BUNDLE_ID !== productBundleIdentifier) {
      _logger.default.info(`Will uninstall running WDA since its bundle id is not equal to the default value ${_constants.WDA_RUNNER_BUNDLE_ID}`);

      return await this.uninstall();
    }

    const actualUpgradeTimestamp = await (0, _utils.getWDAUpgradeTimestamp)(this.bootstrapPath);

    _logger.default.debug(`Upgrade timestamp of the currently bundled WDA: ${actualUpgradeTimestamp}`);

    _logger.default.debug(`Upgrade timestamp of the WDA on the device: ${upgradedAt}`);

    if (actualUpgradeTimestamp && upgradedAt && _lodash.default.toLower(`${actualUpgradeTimestamp}`) !== _lodash.default.toLower(`${upgradedAt}`)) {
      _logger.default.info('Will uninstall running WDA since it has different version in comparison to the one ' + `which is bundled with appium-xcuitest-driver module (${actualUpgradeTimestamp} != ${upgradedAt})`);

      return await this.uninstall();
    }

    const message = _appiumSupport.util.hasValue(productBundleIdentifier) ? `Will reuse previously cached WDA instance at '${this.url.href}' with '${productBundleIdentifier}'` : `Will reuse previously cached WDA instance at '${this.url.href}'`;

    _logger.default.info(`${message}. Set the wdaLocalPort capability to a value different from ${this.url.port} if this is an undesired behavior.`);

    this.webDriverAgentUrl = this.url.href;
  }

  async quitAndUninstall() {
    await this.quit();
    await this.uninstall();
  }

}

exports.WebDriverAgent = WebDriverAgent;
var _default = WebDriverAgent;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi93ZWJkcml2ZXJhZ2VudC5qcyJdLCJuYW1lcyI6WyJXREFfTEFVTkNIX1RJTUVPVVQiLCJXREFfQUdFTlRfUE9SVCIsIldEQV9DRl9CVU5ETEVfTkFNRSIsIlNIQVJFRF9SRVNPVVJDRVNfR1VBUkQiLCJBc3luY0xvY2siLCJXZWJEcml2ZXJBZ2VudCIsImNvbnN0cnVjdG9yIiwieGNvZGVWZXJzaW9uIiwiYXJncyIsIl8iLCJjbG9uZSIsImRldmljZSIsInBsYXRmb3JtVmVyc2lvbiIsInBsYXRmb3JtTmFtZSIsImlvc1Nka1ZlcnNpb24iLCJob3N0IiwiaXNSZWFsRGV2aWNlIiwicmVhbERldmljZSIsImlkYiIsInNldFdEQVBhdGhzIiwiYm9vdHN0cmFwUGF0aCIsImFnZW50UGF0aCIsIndkYUxvY2FsUG9ydCIsIndkYVJlbW90ZVBvcnQiLCJ3ZGFCYXNlVXJsIiwiV0RBX0JBU0VfVVJMIiwicHJlYnVpbGRXREEiLCJ3ZWJEcml2ZXJBZ2VudFVybCIsInN0YXJ0ZWQiLCJ3ZGFDb25uZWN0aW9uVGltZW91dCIsInVzZUNhcnRoYWdlU3NsIiwiaXNCb29sZWFuIiwidXNlWGN0ZXN0cnVuRmlsZSIsInVzZVByZWJ1aWx0V0RBIiwiZGVyaXZlZERhdGFQYXRoIiwibWpwZWdTZXJ2ZXJQb3J0IiwidXBkYXRlZFdEQUJ1bmRsZUlkIiwieGNvZGVidWlsZCIsIlhjb2RlQnVpbGQiLCJzaG93WGNvZGVMb2ciLCJ4Y29kZUNvbmZpZ0ZpbGUiLCJ4Y29kZU9yZ0lkIiwieGNvZGVTaWduaW5nSWQiLCJrZXljaGFpblBhdGgiLCJrZXljaGFpblBhc3N3b3JkIiwidXNlU2ltcGxlQnVpbGRUZXN0IiwibGF1bmNoVGltZW91dCIsIndkYUxhdW5jaFRpbWVvdXQiLCJCT09UU1RSQVBfUEFUSCIsImxvZyIsImluZm8iLCJwYXRoIiwicmVzb2x2ZSIsImNsZWFudXBPYnNvbGV0ZVByb2Nlc3NlcyIsIm9ic29sZXRlUGlkcyIsInVybCIsInBvcnQiLCJjbWRMaW5lIiwiaW5jbHVkZXMiLCJ0b0xvd2VyQ2FzZSIsInVkaWQiLCJpc0VtcHR5IiwiZGVidWciLCJsZW5ndGgiLCJlIiwid2FybiIsIm1lc3NhZ2UiLCJpc1J1bm5pbmciLCJnZXRTdGF0dXMiLCJiYXNlUGF0aCIsIm5vU2Vzc2lvblByb3h5IiwiTm9TZXNzaW9uUHJveHkiLCJzZXJ2ZXIiLCJob3N0bmFtZSIsImJhc2UiLCJ0aW1lb3V0IiwiY29tbWFuZCIsImVyciIsImhyZWYiLCJ1bmluc3RhbGwiLCJidW5kbGVJZHMiLCJnZXRVc2VySW5zdGFsbGVkQnVuZGxlSWRzQnlCdW5kbGVOYW1lIiwiYnVuZGxlSWQiLCJyZW1vdmVBcHAiLCJsYXVuY2giLCJzZXNzaW9uSWQiLCJzZXR1cFByb3hpZXMiLCJmcyIsImV4aXN0cyIsIkVycm9yIiwic3luY2hyb25pemF0aW9uS2V5Iiwibm9ybWFsaXplIiwiYWNxdWlyZSIsImRpZFBlcmZvcm1VcGdyYWRlIiwidXNlU3NsIiwiY2xlYW5Qcm9qZWN0Iiwic3RhcnRXaXRoSURCIiwiaW5pdCIsInByZWJ1aWxkIiwic3RhcnQiLCJ3ZGFCdW5kbGVJZCIsInRlc3RCdW5kbGVJZCIsInByZXBhcmVXREEiLCJlbnYiLCJVU0VfUE9SVCIsIldEQV9QUk9EVUNUX0JVTkRMRV9JREVOVElGSUVSIiwiTUpQRUdfU0VSVkVSX1BPUlQiLCJydW5YQ1VJVGVzdCIsInBhcnNlQnVuZGxlSWQiLCJ3ZGFCdW5kbGVQYXRoIiwiaW5mb1BsaXN0UGF0aCIsImpvaW4iLCJpbmZvUGxpc3QiLCJwbGlzdCIsInBhcnNlUGxpc3QiLCJyZWFkRmlsZSIsIkNGQnVuZGxlSWRlbnRpZmllciIsImZldGNoV0RBQnVuZGxlIiwiaXNBcHBJbnN0YWxsZWQiLCJpbnN0YWxsQXBwIiwiaW5zdGFsbFhDVGVzdEJ1bmRsZSIsIndkYUJ1bmRsZVBhdGhzIiwiZ2xvYiIsIldEQV9SVU5ORVJfQVBQIiwiYWJzb2x1dGUiLCJpc1NvdXJjZUZyZXNoIiwiZXhpc3RzUHJvbWlzZXMiLCJDQVJUSEFHRV9ST09UIiwic2VwIiwibWFwIiwic3ViUGF0aCIsIkIiLCJhbGwiLCJzb21lIiwidiIsInByb3h5T3B0cyIsImtlZXBBbGl2ZSIsImp3cHJveHkiLCJKV1Byb3h5IiwicHJveHlSZXFSZXMiLCJiaW5kIiwicXVpdCIsInJlc2V0IiwiX3VybCIsInBhcnNlIiwicHJvdG9jb2wiLCJmdWxseVN0YXJ0ZWQiLCJyZXRyaWV2ZURlcml2ZWREYXRhUGF0aCIsInNldHVwQ2FjaGluZyIsInN0YXR1cyIsImJ1aWxkIiwicHJvZHVjdEJ1bmRsZUlkZW50aWZpZXIiLCJ1cGdyYWRlZEF0IiwidXRpbCIsImhhc1ZhbHVlIiwiV0RBX1JVTk5FUl9CVU5ETEVfSUQiLCJhY3R1YWxVcGdyYWRlVGltZXN0YW1wIiwidG9Mb3dlciIsInF1aXRBbmRVbmluc3RhbGwiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBRUEsTUFBTUEsa0JBQWtCLEdBQUcsS0FBSyxJQUFoQztBQUNBLE1BQU1DLGNBQWMsR0FBRyxJQUF2QjtBQUNBLE1BQU1DLGtCQUFrQixHQUFHLDZCQUEzQjtBQUVBLE1BQU1DLHNCQUFzQixHQUFHLElBQUlDLGtCQUFKLEVBQS9COztBQUVBLE1BQU1DLGNBQU4sQ0FBcUI7QUFDbkJDLEVBQUFBLFdBQVcsQ0FBRUMsWUFBRixFQUFnQkMsSUFBSSxHQUFHLEVBQXZCLEVBQTJCO0FBQ3BDLFNBQUtELFlBQUwsR0FBb0JBLFlBQXBCO0FBRUEsU0FBS0MsSUFBTCxHQUFZQyxnQkFBRUMsS0FBRixDQUFRRixJQUFSLENBQVo7QUFFQSxTQUFLRyxNQUFMLEdBQWNILElBQUksQ0FBQ0csTUFBbkI7QUFDQSxTQUFLQyxlQUFMLEdBQXVCSixJQUFJLENBQUNJLGVBQTVCO0FBQ0EsU0FBS0MsWUFBTCxHQUFvQkwsSUFBSSxDQUFDSyxZQUF6QjtBQUNBLFNBQUtDLGFBQUwsR0FBcUJOLElBQUks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O2VBK1pOMUUsYyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB1cmwgZnJvbSAndXJsJztcbmltcG9ydCBCIGZyb20gJ2JsdWViaXJkJztcbmltcG9ydCB7IEpXUHJveHkgfSBmcm9tICdhcHBpdW0tYmFzZS1kcml2ZXInO1xuaW1wb3J0IHsgZnMsIHV0aWwsIHBsaXN0IH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuaW1wb3J0IGxvZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBOb1Nlc3Npb25Qcm94eSB9IGZyb20gJy4vbm8tc2Vzc2lvbi1wcm94eSc7XG5pbXBvcnQgeyBnZXRXREFVcGdyYWRlVGltZXN0YW1wLCByZXNldFRlc3RQcm9jZXNzZXMsIGdldFBJRHNMaXN0ZW5pbmdPblBvcnQgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCBYY29kZUJ1aWxkIGZyb20gJy4veGNvZGVidWlsZCc7XG5pbXBvcnQgeyBleGVjIH0gZnJvbSAndGVlbl9wcm9jZXNzJztcbmltcG9ydCBBc3luY0xvY2sgZnJvbSAnYXN5bmMtbG9jayc7XG5pbXBvcnQgeyBjaGVja0ZvckRlcGVuZGVuY2llcywgYnVuZGxlV0RBU2ltIH0gZnJvbSAnLi9jaGVjay1kZXBlbmRlbmNpZXMnO1xuaW1wb3J0IHsgQk9PVFNUUkFQX1BBVEgsIFdEQV9SVU5ORVJfQlVORExFX0lELCBDQVJUSEFHRV9ST09ULCBXREFfUlVOTkVSX0FQUCwgV0RBX0JBU0VfVVJMIH0gZnJvbSAnLi9jb25zdGFudHMnO1xuXG5jb25zdCBXREFfTEFVTkNIX1RJTUVPVVQgPSA2MCAqIDEwMDA7XG5jb25zdCBXREFfQUdFTlRfUE9SVCA9IDgxMDA7XG5jb25zdCBXREFfQ0ZfQlVORExFX05BTUUgPSAnV2ViRHJpdmVyQWdlbnRSdW5uZXItUnVubmVyJztcblxuY29uc3QgU0hBUkVEX1JFU09VUkNFU19HVUFSRCA9IG5ldyBBc3luY0xvY2soKTtcblxuY2xhc3MgV2ViRHJpdmVyQWdlbnQge1xuICBjb25zdHJ1Y3RvciAoeGNvZGVWZXJzaW9uLCBhcmdzID0ge30pIHtcbiAgICB0aGlzLnhjb2RlVmVyc2lvbiA9IHhjb2RlVmVyc2lvbjtcblxuICAgIHRoaXMuYXJncyA9IF8uY2xvbmUoYXJncyk7XG5cbiAgICB0aGlzLmRldmljZSA9IGFyZ3MuZGV2aWNlO1xuICAgIHRoaXMucGxhdGZvcm1WZXJzaW9uID0gYXJncy5wbGF0Zm9ybVZlcnNpb247XG4gICAgdGhpcy5wbGF0Zm9ybU5hbWUgPSBhcmdzLnBsYXRmb3JtTmFtZTtcbiAgICB0aGlzLmlvc1Nka1ZlcnNpb24gPSBhcmdzLmlvc1Nka1ZlcnNpb247XG4gICAgdGhpcy5ob3N0ID0gYXJncy5ob3N0O1xuICAgIHRoaXMuaXNSZWFsRGV2aWNlID0gISFhcmdzLnJlYWxEZXZpY2U7XG4gICAgdGhpcy5pZGIgPSAoYXJncy5kZXZpY2UgfHwge30pLmlkYjtcblxuICAgIHRoaXMuc2V0V0RBUGF0aHMoYXJncy5ib290c3RyYXBQYXRoLCBhcmdzLmFnZW50UGF0aCk7XG5cbiAgICB0aGlzLndkYUxvY2FsUG9ydCA9IGFyZ3Mud2RhTG9jYWxQb3J0O1xuICAgIHRoaXMud2RhUmVtb3RlUG9ydCA9IGFyZ3Mud2RhTG9jYWxQb3J0IHx8IFdEQV9BR0VOVF9QT1JUO1xuICAgIHRoaXMud2RhQmFzZVVybCA9IGFyZ3Mud2RhQmFzZVVybCB8fCBXREFfQkFTRV9VUkw7XG5cbiAgICB0aGlzLnByZWJ1aWxkV0RBID0gYXJncy5wcmVidWlsZFdEQTtcblxuICAgIHRoaXMud2ViRHJpdmVyQWdlbnRVcmwgPSBhcmdzLndlYkRyaXZlckFnZW50VXJsO1xuXG4gICAgdGhpcy5zdGFydGVkID0gZmFsc2U7XG5cbiAgICB0aGlzLndkYUNvbm5lY3Rpb25UaW1lb3V0ID0gYXJncy53ZGFDb25uZWN0aW9uVGltZW91dDtcblxuICAgIHRoaXMudXNlQ2FydGhhZ2VTc2wgPSBfLmlzQm9vbGVhbihhcmdzLnVzZUNhcnRoYWdlU3NsKSAmJiBhcmdzLnVzZUNhcnRoYWdlU3NsO1xuXG4gICAgdGhpcy51c2VYY3Rlc3RydW5GaWxlID0gYXJncy51c2VYY3Rlc3RydW5GaWxlO1xuICAgIHRoaXMudXNlUHJlYnVpbHRXREEgPSBhcmdzLnVzZVByZWJ1aWx0V0RBO1xuICAgIHRoaXMuZGVyaXZlZERhdGFQYXRoID0gYXJncy5kZXJpdmVkRGF0YVBhdGg7XG4gICAgdGhpcy5tanBlZ1NlcnZlclBvcnQgPSBhcmdzLm1qcGVnU2VydmVyUG9ydDtcblxuICAgIHRoaXMudXBkYXRlZFdEQUJ1bmRsZUlkID0gYXJncy51cGRhdGVkV0RBQnVuZGxlSWQ7XG5cbiAgICB0aGlzLnhjb2RlYnVpbGQgPSBuZXcgWGNvZGVCdWlsZCh0aGlzLnhjb2RlVmVyc2lvbiwgdGhpcy5kZXZpY2UsIHtcbiAgICAgIHBsYXRmb3JtVmVyc2lvbjogdGhpcy5wbGF0Zm9ybVZlcnNpb24sXG4gICAgICBwbGF0Zm9ybU5hbWU6IHRoaXMucGxhdGZvcm1OYW1lLFxuICAgICAgaW9zU2RrVmVyc2lvbjogdGhpcy5pb3NTZGtWZXJzaW9uLFxuICAgICAgYWdlbnRQYXRoOiB0aGlzLmFnZW50UGF0aCxcbiAgICAgIGJvb3RzdHJhcFBhdGg6IHRoaXMuYm9vdHN0cmFwUGF0aCxcbiAgICAgIHJlYWxEZXZpY2U6IHRoaXMuaXNSZWFsRGV2aWNlLFxuICAgICAgc2hvd1hjb2RlTG9nOiBhcmdzLnNob3dYY29kZUxvZyxcbiAgICAgIHhjb2RlQ29uZmlnRmlsZTogYXJncy54Y29kZUNvbmZpZ0ZpbGUsXG4gICAgICB4Y29kZU9yZ0lkOiBhcmdzLnhjb2RlT3JnSWQsXG4gICAgICB4Y29kZVNpZ25pbmdJZDogYXJncy54Y29kZVNpZ25pbmdJZCxcbiAgICAgIGtleWNoYWluUGF0aDogYXJncy5rZXljaGFpblBhdGgsXG4gICAgICBrZXljaGFpblBhc3N3b3JkOiBhcmdzLmtleWNoYWluUGFzc3dvcmQsXG4gICAgICB1c2VTaW1wbGVCdWlsZFRlc3Q6IGFyZ3MudXNlU2ltcGxlQnVpbGRUZXN0LFxuICAgICAgdXNlUHJlYnVpbHRXREE6IGFyZ3MudXNlUHJlYnVpbHRXREEsXG4gICAgICB1cGRhdGVkV0RBQnVuZGxlSWQ6IHRoaXMudXBkYXRlZFdEQUJ1bmRsZUlkLFxuICAgICAgbGF1bmNoVGltZW91dDogYXJncy53ZGFMYXVuY2hUaW1lb3V0IHx8IFdEQV9MQVVOQ0hfVElNRU9VVCxcbiAgICAgIHdkYVJlbW90ZVBvcnQ6IHRoaXMud2RhUmVtb3RlUG9ydCxcbiAgICAgIHVzZVhjdGVzdHJ1bkZpbGU6IHRoaXMudXNlWGN0ZXN0cnVuRmlsZSxcbiAgICAgIGRlcml2ZWREYXRhUGF0aDogYXJncy5kZXJpdmVkRGF0YVBhdGgsXG4gICAgICBtanBlZ1NlcnZlclBvcnQ6IHRoaXMubWpwZWdTZXJ2ZXJQb3J0LFxuICAgIH0pO1xuICB9XG5cbiAgc2V0V0RBUGF0aHMgKGJvb3RzdHJhcFBhdGgsIGFnZW50UGF0aCkge1xuICAgIC8vIGFsbG93IHRoZSB1c2VyIHRvIHNwZWNpZnkgYSBwbGFjZSBmb3IgV0RBLiBUaGlzIGlzIHVuZG9jdW1lbnRlZCBhbmRcbiAgICAvLyBvbmx5IGhlcmUgZm9yIHRoZSBwdXJwb3NlcyBvZiB0ZXN0aW5nIGRldmVsb3BtZW50IG9mIFdEQVxuICAgIHRoaXMuYm9vdHN0cmFwUGF0aCA9IGJvb3RzdHJhcFBhdGggfHwgQk9PVFNUUkFQX1BBVEg7XG4gICAgbG9nLmluZm8oYFVzaW5nIFdEQSBwYXRoOiAnJHt0aGlzLmJvb3RzdHJhcFBhdGh9J2ApO1xuXG4gICAgLy8gZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgd2UgbmVlZCB0byBiZSBhYmxlIHRvIHNwZWNpZnkgYWdlbnRQYXRoIHRvb1xuICAgIHRoaXMuYWdlbnRQYXRoID0gYWdlbnRQYXRoIHx8IHBhdGgucmVzb2x2ZSh0aGlzLmJvb3RzdHJhcFBhdGgsICdXZWJEcml2ZXJBZ2VudC54Y29kZXByb2onKTtcbiAgICBsb2cuaW5mbyhgVXNpbmcgV0RBIGFnZW50OiAnJHt0aGlzLmFnZW50UGF0aH0nYCk7XG4gIH1cblxuICBhc3luYyBjbGVhbnVwT2Jzb2xldGVQcm9jZXNzZXMgKCkge1xuICAgIGNvbnN0IG9ic29sZXRlUGlkcyA9IGF3YWl0IGdldFBJRHNMaXN0ZW5pbmdPblBvcnQodGhpcy51cmwucG9ydCxcbiAgICAgIChjbWRMaW5lKSA9PiBjbWRMaW5lLmluY2x1ZGVzKCcvV2ViRHJpdmVyQWdlbnRSdW5uZXInKSAmJlxuICAgICAgICAhY21kTGluZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRoaXMuZGV2aWNlLnVkaWQudG9Mb3dlckNhc2UoKSkpO1xuXG4gICAgaWYgKF8uaXNFbXB0eShvYnNvbGV0ZVBpZHMpKSB7XG4gICAgICBsb2cuZGVidWcoYE5vIG9ic29sZXRlIGNhY2hlZCBwcm9jZXNzZXMgZnJvbSBwcmV2aW91cyBXREEgc2Vzc2lvbnMgYCArXG4gICAgICAgIGBsaXN0ZW5pbmcgb24gcG9ydCAke3RoaXMudXJsLnBvcnR9IGhhdmUgYmVlbiBmb3VuZGApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvZy5pbmZvKGBEZXRlY3RlZCAke29ic29sZXRlUGlkcy5sZW5ndGh9IG9ic29sZXRlIGNhY2hlZCBwcm9jZXNzJHtvYnNvbGV0ZVBpZHMubGVuZ3RoID09PSAxID8gJycgOiAnZXMnfSBgICtcbiAgICAgIGBmcm9tIHByZXZpb3VzIFdEQSBzZXNzaW9ucy4gQ2xlYW5pbmcgdGhlbSB1cGApO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBleGVjKCdraWxsJywgb2Jzb2xldGVQaWRzKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2cud2FybihgRmFpbGVkIHRvIGtpbGwgb2Jzb2xldGUgY2FjaGVkIHByb2Nlc3Mke29ic29sZXRlUGlkcy5sZW5ndGggPT09IDEgPyAnJyA6ICdlcyd9ICcke29ic29sZXRlUGlkc30nLiBgICtcbiAgICAgICAgYE9yaWdpbmFsIGVycm9yOiAke2UubWVzc2FnZX1gKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJuIGJvb2xlYW4gaWYgV0RBIGlzIHJ1bm5pbmcgb3Igbm90XG4gICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgV0RBIGlzIHJ1bm5pbmdcbiAgICogQHRocm93cyB7RXJyb3J9IElmIHRoZXJlIHdhcyBpbnZhbGlkIHJlc3BvbnNlIGNvZGUgb3IgYm9keVxuICAgKi9cbiAgYXN5bmMgaXNSdW5uaW5nICgpIHtcbiAgICByZXR1cm4gISEoYXdhaXQgdGhpcy5nZXRTdGF0dXMoKSk7XG4gIH1cblxuICBnZXQgYmFzZVBhdGggKCkge1xuICAgIGlmICh0aGlzLnVybC5wYXRoID09PSAnLycpIHtcbiAgICAgIHJldHVybiAnJztcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMudXJsLnBhdGggfHwgJyc7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJuIGN1cnJlbnQgcnVubmluZyBXREEncyBzdGF0dXMgbGlrZSBiZWxvd1xuICAgKiB7XG4gICAqICAgXCJzdGF0ZVwiOiBcInN1Y2Nlc3NcIixcbiAgICogICBcIm9zXCI6IHtcbiAgICogICAgIFwibmFtZVwiOiBcImlPU1wiLFxuICAgKiAgICAgXCJ2ZXJzaW9uXCI6IFwiMTEuNFwiLFxuICAgKiAgICAgXCJzZGtWZXJzaW9uXCI6IFwiMTEuM1wiXG4gICAqICAgfSxcbiAgICogICBcImlvc1wiOiB7XG4gICAqICAgICBcInNpbXVsYXRvclZlcnNpb25cIjogXCIxMS40XCIsXG4gICAqICAgICBcImlwXCI6IFwiMTcyLjI1NC45OS4zNFwiXG4gICAqICAgfSxcbiAgICogICBcImJ1aWxkXCI6IHtcbiAgICogICAgIFwidGltZVwiOiBcIkp1biAyNCAyMDE4IDE3OjA4OjIxXCIsXG4gICAqICAgICBcInByb2R1Y3RCdW5kbGVJZGVudGlmaWVyXCI6IFwiY29tLmZhY2Vib29rLldlYkRyaXZlckFnZW50UnVubmVyXCJcbiAgICogICB9XG4gICAqIH1cbiAgICpcbiAgICogQHJldHVybiB7P29iamVjdH0gU3RhdGUgT2JqZWN0XG4gICAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGVyZSB3YXMgaW52YWxpZCByZXNwb25zZSBjb2RlIG9yIGJvZHlcbiAgICovXG4gIGFzeW5jIGdldFN0YXR1cyAoKSB7XG4gICAgY29uc3Qgbm9TZXNzaW9uUHJveHkgPSBuZXcgTm9TZXNzaW9uUHJveHkoe1xuICAgICAgc2VydmVyOiB0aGlzLnVybC5ob3N0bmFtZSxcbiAgICAgIHBvcnQ6IHRoaXMudXJsLnBvcnQsXG4gICAgICBiYXNlOiB0aGlzLmJhc2VQYXRoLFxuICAgICAgdGltZW91dDogMzAwMCxcbiAgICB9KTtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGF3YWl0IG5vU2Vzc2lvblByb3h5LmNvbW1hbmQoJy9zdGF0dXMnLCAnR0VUJyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBsb2cuZGVidWcoYFdEQSBpcyBub3QgbGlzdGVuaW5nIGF0ICcke3RoaXMudXJsLmhyZWZ9J2ApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVuaW5zdGFsbCBXREFzIGZyb20gdGhlIHRlc3QgZGV2aWNlLlxuICAgKiBPdmVyIFhjb2RlIDExLCBtdWx0aXBsZSBXREEgY2FuIGJlIGluIHRoZSBkZXZpY2Ugc2luY2UgWGNvZGUgMTEgZ2VuZXJhdGVzIGRpZmZlcmVudCBXREEuXG4gICAqIEFwcGl1bSBkb2VzIG5vdCBleHBlY3QgbXVsdGlwbGUgV0RBcyBhcmUgcnVubmluZyBvbiBhIGRldmljZS5cbiAgICovXG4gIGFzeW5jIHVuaW5zdGFsbCAoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJ1bmRsZUlkcyA9IGF3YWl0IHRoaXMuZGV2aWNlLmdldFVzZXJJbnN0YWxsZWRCdW5kbGVJZHNCeUJ1bmRsZU5hbWUoV0RBX0NGX0JVTkRMRV9OQU1FKTtcbiAgICAgIGlmIChfLmlzRW1wdHkoYnVuZGxlSWRzKSkge1xuICAgICAgICBsb2cuZGVidWcoJ05vIFdEQXMgb24gdGhlIGRldmljZS4nKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsb2cuZGVidWcoYFVuaW5zdGFsbGluZyBXREFzOiAnJHtidW5kbGVJZHN9J2ApO1xuICAgICAgZm9yIChjb25zdCBidW5kbGVJZCBvZiBidW5kbGVJZHMpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kZXZpY2UucmVtb3ZlQXBwKGJ1bmRsZUlkKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2cuZGVidWcoZSk7XG4gICAgICBsb2cud2FybihgV2ViRHJpdmVyQWdlbnQgdW5pbnN0YWxsIGZhaWxlZC4gUGVyaGFwcywgaXQgaXMgYWxyZWFkeSB1bmluc3RhbGxlZD8gYCArXG4gICAgICAgIGBPcmlnaW5hbCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gICAgfVxuICB9XG5cblxuICAvKipcbiAgICogUmV0dXJuIGN1cnJlbnQgcnVubmluZyBXREEncyBzdGF0dXMgbGlrZSBiZWxvdyBhZnRlciBsYXVuY2hpbmcgV0RBXG4gICAqIHtcbiAgICogICBcInN0YXRlXCI6IFwic3VjY2Vzc1wiLFxuICAgKiAgIFwib3NcIjoge1xuICAgKiAgICAgXCJuYW1lXCI6IFwiaU9TXCIsXG4gICAqICAgICBcInZlcnNpb25cIjogXCIxMS40XCIsXG4gICAqICAgICBcInNka1ZlcnNpb25cIjogXCIxMS4zXCJcbiAgICogICB9LFxuICAgKiAgIFwiaW9zXCI6IHtcbiAgICogICAgIFwic2ltdWxhdG9yVmVyc2lvblwiOiBcIjExLjRcIixcbiAgICogICAgIFwiaXBcIjogXCIxNzIuMjU0Ljk5LjM0XCJcbiAgICogICB9LFxuICAgKiAgIFwiYnVpbGRcIjoge1xuICAgKiAgICAgXCJ0aW1lXCI6IFwiSnVuIDI0IDIwMTggMTc6MDg6MjFcIixcbiAgICogICAgIFwicHJvZHVjdEJ1bmRsZUlkZW50aWZpZXJcIjogXCJjb20uZmFjZWJvb2suV2ViRHJpdmVyQWdlbnRSdW5uZXJcIlxuICAgKiAgIH1cbiAgICogfVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gc2Vzc2lvbklkIExhdW5jaCBXREEgYW5kIGVzdGFibGlzaCB0aGUgc2Vzc2lvbiB3aXRoIHRoaXMgc2Vzc2lvbklkXG4gICAqIEByZXR1cm4gez9vYmplY3R9IFN0YXRlIE9iamVjdFxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlcmUgd2FzIGludmFsaWQgcmVzcG9uc2UgY29kZSBvciBib2R5XG4gICAqL1xuICBhc3luYyBsYXVuY2ggKHNlc3Npb25JZCkge1xuICAgIGlmICh0aGlzLndlYkRyaXZlckFnZW50VXJsKSB7XG4gICAgICBsb2cuaW5mbyhgVXNpbmcgcHJvdmlkZWQgV2ViZHJpdmVyQWdlbnQgYXQgJyR7dGhpcy53ZWJEcml2ZXJBZ2VudFVybH0nYCk7XG4gICAgICB0aGlzLnVybCA9IHRoaXMud2ViRHJpdmVyQWdlbnRVcmw7XG4gICAgICB0aGlzLnNldHVwUHJveGllcyhzZXNzaW9uSWQpO1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0U3RhdHVzKCk7XG4gICAgfVxuXG4gICAgbG9nLmluZm8oJ0xhdW5jaGluZyBXZWJEcml2ZXJBZ2VudCBvbiB0aGUgZGV2aWNlJyk7XG5cbiAgICB0aGlzLnNldHVwUHJveGllcyhzZXNzaW9uSWQpO1xuXG4gICAgaWYgKCF0aGlzLnVzZVhjdGVzdHJ1bkZpbGUgJiYgIWF3YWl0IGZzLmV4aXN0cyh0aGlzLmFnZW50UGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVHJ5aW5nIHRvIHVzZSBXZWJEcml2ZXJBZ2VudCBwcm9qZWN0IGF0ICcke3RoaXMuYWdlbnRQYXRofScgYnV0IHRoZSBgICtcbiAgICAgICAgICAgICAgICAgICAgICAnZmlsZSBkb2VzIG5vdCBleGlzdCcpO1xuICAgIH1cblxuICAgIC8vIHVzZVhjdGVzdHJ1bkZpbGUgYW5kIHVzZVByZWJ1aWx0V0RBIHVzZSBleGlzdGluZyBkZXBlbmRlbmNpZXNcbiAgICAvLyBJdCBkZXBlbmRzIG9uIHVzZXIgc2lkZVxuICAgIGlmICh0aGlzLmlkYiB8fCB0aGlzLnVzZVhjdGVzdHJ1bkZpbGUgfHwgKHRoaXMuZGVyaXZlZERhdGFQYXRoICYmIHRoaXMudXNlUHJlYnVpbHRXREEpKSB7XG4gICAgICBsb2cuaW5mbygnU2tpcHBlZCBXREEgZGVwZW5kZW5jaWVzIHJlc29sdXRpb24gYWNjb3JkaW5nIHRvIHRoZSBwcm92aWRlZCBjYXBhYmlsaXRpZXMnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gbWFrZSBzdXJlIHRoYXQgdGhlIFdEQSBkZXBlbmRlbmNpZXMgaGF2ZSBiZWVuIGJ1aWx0XG4gICAgICBjb25zdCBzeW5jaHJvbml6YXRpb25LZXkgPSBwYXRoLm5vcm1hbGl6ZSh0aGlzLmJvb3RzdHJhcFBhdGgpO1xuICAgICAgYXdhaXQgU0hBUkVEX1JFU09VUkNFU19HVUFSRC5hY3F1aXJlKHN5bmNocm9uaXphdGlvbktleSwgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBkaWRQZXJmb3JtVXBncmFkZSA9IGF3YWl0IGNoZWNrRm9yRGVwZW5kZW5jaWVzKHt1c2VTc2w6IHRoaXMudXNlQ2FydGhhZ2VTc2x9KTtcbiAgICAgICAgaWYgKGRpZFBlcmZvcm1VcGdyYWRlKSB7XG4gICAgICAgICAgLy8gT25seSBwZXJmb3JtIHRoZSBjbGVhbnVwIGFmdGVyIFdEQSB1cGdyYWRlXG4gICAgICAgICAgYXdhaXQgdGhpcy54Y29kZWJ1aWxkLmNsZWFuUHJvamVjdCgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgLy8gV2UgbmVlZCB0byBwcm92aWRlIFdEQSBsb2NhbCBwb3J0LCBiZWNhdXNlIGl0IG1pZ2h0IGJlIG9jY3VwaWVkIHdpdGhcbiAgICBhd2FpdCByZXNldFRlc3RQcm9jZXNzZXModGhpcy5kZXZpY2UudWRpZCwgIXRoaXMuaXNSZWFsRGV2aWNlKTtcblxuICAgIGlmICh0aGlzLmlkYikge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc3RhcnRXaXRoSURCKCk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy54Y29kZWJ1aWxkLmluaXQodGhpcy5ub1Nlc3Npb25Qcm94eSk7XG5cbiAgICAvLyBTdGFydCB0aGUgeGNvZGVidWlsZCBwcm9jZXNzXG4gICAgaWYgKHRoaXMucHJlYnVpbGRXREEpIHtcbiAgICAgIGF3YWl0IHRoaXMueGNvZGVidWlsZC5wcmVidWlsZCgpO1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgdGhpcy54Y29kZWJ1aWxkLnN0YXJ0KCk7XG4gIH1cblxuICBhc3luYyBzdGFydFdpdGhJREIgKCkge1xuICAgIGxvZy5pbmZvKCdXaWxsIGxhdW5jaCBXREEgd2l0aCBpZGIgaW5zdGVhZCBvZiB4Y29kZWJ1aWxkIHNpbmNlIHRoZSBjb3JyZXNwb25kaW5nIGZsYWcgaXMgZW5hYmxlZCcpO1xuICAgIGNvbnN0IHt3ZGFCdW5kbGVJZCwgdGVzdEJ1bmRsZUlkfSA9IGF3YWl0IHRoaXMucHJlcGFyZVdEQSgpO1xuICAgIGNvbnN0IGVudiA9IHtcbiAgICAgIFVTRV9QT1JUOiB0aGlzLndkYVJlbW90ZVBvcnQsXG4gICAgICBXREFfUFJPRFVDVF9CVU5ETEVfSURFTlRJRklFUjogdGhpcy51cGRhdGVkV0RBQnVuZGxlSWQsXG4gICAgfTtcbiAgICBpZiAodGhpcy5tanBlZ1NlcnZlclBvcnQpIHtcbiAgICAgIGVudi5NSlBFR19TRVJWRVJfUE9SVCA9IHRoaXMubWpwZWdTZXJ2ZXJQb3J0O1xuICAgIH1cblxuICAgIHJldHVybiBhd2FpdCB0aGlzLmlkYi5ydW5YQ1VJVGVzdCh3ZGFCdW5kbGVJZCwgd2RhQnVuZGxlSWQsIHRlc3RCdW5kbGVJZCwge2Vudn0pO1xuICB9XG5cbiAgYXN5bmMgcGFyc2VCdW5kbGVJZCAod2RhQnVuZGxlUGF0aCkge1xuICAgIGNvbnN0IGluZm9QbGlzdFBhdGggPSBwYXRoLmpvaW4od2RhQnVuZGxlUGF0aCwgJ0luZm8ucGxpc3QnKTtcbiAgICBjb25zdCBpbmZvUGxpc3QgPSBhd2FpdCBwbGlzdC5wYXJzZVBsaXN0KGF3YWl0IGZzLnJlYWRGaWxlKGluZm9QbGlzdFBhdGgpKTtcbiAgICBpZiAoIWluZm9QbGlzdC5DRkJ1bmRsZUlkZW50aWZpZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgYnVuZGxlIGlkIGluICcke2luZm9QbGlzdFBhdGh9J2ApO1xuICAgIH1cbiAgICByZXR1cm4gaW5mb1BsaXN0LkNGQnVuZGxlSWRlbnRpZmllcjtcbiAgfVxuXG4gIGFzeW5jIHByZXBhcmVXREEgKCkge1xuICAgIGNvbnN0IHdkYUJ1bmRsZVBhdGggPSBhd2FpdCB0aGlzLmZldGNoV0RBQnVuZGxlKCk7XG4gICAgY29uc3Qgd2RhQnVuZGxlSWQgPSBhd2FpdCB0aGlzLnBhcnNlQnVuZGxlSWQod2RhQnVuZGxlUGF0aCk7XG4gICAgaWYgKCFhd2FpdCB0aGlzLmRldmljZS5pc0FwcEluc3RhbGxlZCh3ZGFCdW5kbGVJZCkpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGV2aWNlLmluc3RhbGxBcHAod2RhQnVuZGxlUGF0aCk7XG4gICAgfVxuICAgIGNvbnN0IHRlc3RCdW5kbGVJZCA9IGF3YWl0IHRoaXMuaWRiLmluc3RhbGxYQ1Rlc3RCdW5kbGUocGF0aC5qb2luKHdkYUJ1bmRsZVBhdGgsICdQbHVnSW5zJywgJ1dlYkRyaXZlckFnZW50UnVubmVyLnhjdGVzdCcpKTtcbiAgICByZXR1cm4ge3dkYUJ1bmRsZUlkLCB0ZXN0QnVuZGxlSWQsIHdkYUJ1bmRsZVBhdGh9O1xuICB9XG5cbiAgYXN5bmMgZmV0Y2hXREFCdW5kbGUgKCkge1xuICAgIGlmICghdGhpcy5kZXJpdmVkRGF0YVBhdGgpIHtcbiAgICAgIHJldHVybiBhd2FpdCBidW5kbGVXREFTaW0odGhpcy54Y29kZWJ1aWxkKTtcbiAgICB9XG4gICAgY29uc3Qgd2RhQnVuZGxlUGF0aHMgPSBhd2FpdCBmcy5nbG9iKGAke3RoaXMuZGVyaXZlZERhdGFQYXRofS8qKi8qJHtXREFfUlVOTkVSX0FQUH0vYCwge1xuICAgICAgYWJzb2x1dGU6IHRydWUsXG4gICAgfSk7XG4gICAgaWYgKF8uaXNFbXB0eSh3ZGFCdW5kbGVQYXRocykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgdGhlIFdEQSBidW5kbGUgaW4gJyR7dGhpcy5kZXJpdmVkRGF0YVBhdGh9J2ApO1xuICAgIH1cbiAgICByZXR1cm4gd2RhQnVuZGxlUGF0aHNbMF07XG4gIH1cblxuICBhc3luYyBpc1NvdXJjZUZyZXNoICgpIHtcbiAgICBjb25zdCBleGlzdHNQcm9taXNlcyA9IFtcbiAgICAgIENBUlRIQUdFX1JPT1QsXG4gICAgICAnUmVzb3VyY2VzJyxcbiAgICAgIGBSZXNvdXJjZXMke3BhdGguc2VwfVdlYkRyaXZlckFnZW50LmJ1bmRsZWAsXG4gICAgXS5tYXAoKHN1YlBhdGgpID0+IGZzLmV4aXN0cyhwYXRoLnJlc29sdmUodGhpcy5ib290c3RyYXBQYXRoLCBzdWJQYXRoKSkpO1xuICAgIHJldHVybiAoYXdhaXQgQi5hbGwoZXhpc3RzUHJvbWlzZXMpKS5zb21lKCh2KSA9PiB2ID09PSBmYWxzZSk7XG4gIH1cblxuICBzZXR1cFByb3hpZXMgKHNlc3Npb25JZCkge1xuICAgIGNvbnN0IHByb3h5T3B0cyA9IHtcbiAgICAgIHNlcnZlcjogdGhpcy51cmwuaG9zdG5hbWUsXG4gICAgICBwb3J0OiB0aGlzLnVybC5wb3J0LFxuICAgICAgYmFzZTogdGhpcy5iYXNlUGF0aCxcbiAgICAgIHRpbWVvdXQ6IHRoaXMud2RhQ29ubmVjdGlvblRpbWVvdXQsXG4gICAgICBrZWVwQWxpdmU6IHRydWUsXG4gICAgfTtcblxuICAgIHRoaXMuandwcm94eSA9IG5ldyBKV1Byb3h5KHByb3h5T3B0cyk7XG4gICAgdGhpcy5qd3Byb3h5LnNlc3Npb25JZCA9IHNlc3Npb25JZDtcbiAgICB0aGlzLnByb3h5UmVxUmVzID0gdGhpcy5qd3Byb3h5LnByb3h5UmVxUmVzLmJpbmQodGhpcy5qd3Byb3h5KTtcblxuICAgIHRoaXMubm9TZXNzaW9uUHJveHkgPSBuZXcgTm9TZXNzaW9uUHJveHkocHJveHlPcHRzKTtcbiAgfVxuXG4gIGFzeW5jIHF1aXQgKCkge1xuICAgIGxvZy5pbmZvKCdTaHV0dGluZyBkb3duIHN1Yi1wcm9jZXNzZXMnKTtcblxuICAgIGF3YWl0IHRoaXMueGNvZGVidWlsZC5xdWl0KCk7XG4gICAgYXdhaXQgdGhpcy54Y29kZWJ1aWxkLnJlc2V0KCk7XG5cbiAgICBpZiAodGhpcy5qd3Byb3h5KSB7XG4gICAgICB0aGlzLmp3cHJveHkuc2Vzc2lvbklkID0gbnVsbDtcbiAgICB9XG5cbiAgICB0aGlzLnN0YXJ0ZWQgPSBmYWxzZTtcblxuICAgIGlmICghdGhpcy5hcmdzLndlYkRyaXZlckFnZW50VXJsKSB7XG4gICAgICAvLyBpZiB3ZSBwb3B1bGF0ZWQgdGhlIHVybCBvdXJzZWx2ZXMgKGR1cmluZyBgc2V0dXBDYWNoaW5nYCBjYWxsLCBmb3IgaW5zdGFuY2UpXG4gICAgICAvLyB0aGVuIGNsZWFuIHRoYXQgdXAuIElmIHRoZSB1cmwgd2FzIHN1cHBsaWVkLCB3ZSB3YW50IHRvIGtlZXAgaXRcbiAgICAgIHRoaXMud2ViRHJpdmVyQWdlbnRVcmwgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGdldCB1cmwgKCkge1xuICAgIGlmICghdGhpcy5fdXJsKSB7XG4gICAgICBpZiAodGhpcy53ZWJEcml2ZXJBZ2VudFVybCkge1xuICAgICAgICB0aGlzLl91cmwgPSB1cmwucGFyc2UodGhpcy53ZWJEcml2ZXJBZ2VudFVybCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwb3J0ID0gdGhpcy53ZGFMb2NhbFBvcnQgfHwgV0RBX0FHRU5UX1BPUlQ7XG4gICAgICAgIGNvbnN0IHtwcm90b2NvbCwgaG9zdG5hbWV9ID0gdXJsLnBhcnNlKHRoaXMud2RhQmFzZVVybCB8fCBXREFfQkFTRV9VUkwpO1xuICAgICAgICB0aGlzLl91cmwgPSB1cmwucGFyc2UoYCR7cHJvdG9jb2x9Ly8ke2hvc3RuYW1lfToke3BvcnR9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl91cmw7XG4gIH1cblxuICBzZXQgdXJsIChfdXJsKSB7XG4gICAgdGhpcy5fdXJsID0gdXJsLnBhcnNlKF91cmwpO1xuICB9XG5cbiAgZ2V0IGZ1bGx5U3RhcnRlZCAoKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhcnRlZDtcbiAgfVxuXG4gIHNldCBmdWxseVN0YXJ0ZWQgKHN0YXJ0ZWQgPSBmYWxzZSkge1xuICAgIHRoaXMuc3RhcnRlZCA9IHN0YXJ0ZWQ7XG4gIH1cblxuICBhc3luYyByZXRyaWV2ZURlcml2ZWREYXRhUGF0aCAoKSB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMueGNvZGVidWlsZC5yZXRyaWV2ZURlcml2ZWREYXRhUGF0aCgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldXNlIHJ1bm5pbmcgV0RBIGlmIGl0IGhhcyB0aGUgc2FtZSBidW5kbGUgaWQgd2l0aCB1cGRhdGVkV0RBQnVuZGxlSWQuXG4gICAqIE9yIHJldXNlIGl0IGlmIGl0IGhhcyB0aGUgZGVmYXVsdCBpZCB3aXRob3V0IHVwZGF0ZWRXREFCdW5kbGVJZC5cbiAgICogVW5pbnN0YWxsIGl0IGlmIHRoZSBtZXRob2QgZmFjZXMgYW4gZXhjZXB0aW9uIGZvciB0aGUgYWJvdmUgc2l0dWF0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gdXBkYXRlZFdEQUJ1bmRsZUlkIEJ1bmRsZUlkIHlvdSdkIGxpa2UgdG8gdXNlXG4gICAqL1xuICBhc3luYyBzZXR1cENhY2hpbmcgKCkge1xuICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IHRoaXMuZ2V0U3RhdHVzKCk7XG4gICAgaWYgKCFzdGF0dXMgfHwgIXN0YXR1cy5idWlsZCkge1xuICAgICAgbG9nLmRlYnVnKCdXREEgaXMgY3VycmVudGx5IG5vdCBydW5uaW5nLiBUaGVyZSBpcyBub3RoaW5nIHRvIGNhY2hlJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qge1xuICAgICAgcHJvZHVjdEJ1bmRsZUlkZW50aWZpZXIsXG4gICAgICB1cGdyYWRlZEF0LFxuICAgIH0gPSBzdGF0dXMuYnVpbGQ7XG4gICAgLy8gZm9yIHJlYWwgZGV2aWNlXG4gICAgaWYgKHV0aWwuaGFzVmFsdWUocHJvZHVjdEJ1bmRsZUlkZW50aWZpZXIpICYmIHV0aWwuaGFzVmFsdWUodGhpcy51cGRhdGVkV0RBQnVuZGxlSWQpICYmIHRoaXMudXBkYXRlZFdEQUJ1bmRsZUlkICE9PSBwcm9kdWN0QnVuZGxlSWRlbnRpZmllcikge1xuICAgICAgbG9nLmluZm8oYFdpbGwgdW5pbnN0YWxsIHJ1bm5pbmcgV0RBIHNpbmNlIGl0IGhhcyBkaWZmZXJlbnQgYnVuZGxlIGlkLiBUaGUgYWN0dWFsIHZhbHVlIGlzICcke3Byb2R1Y3RCdW5kbGVJZGVudGlmaWVyfScuYCk7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy51bmluc3RhbGwoKTtcbiAgICB9XG4gICAgLy8gZm9yIHNpbXVsYXRvclxuICAgIGlmICh1dGlsLmhhc1ZhbHVlKHByb2R1Y3RCdW5kbGVJZGVudGlmaWVyKSAmJiAhdXRpbC5oYXNWYWx1ZSh0aGlzLnVwZGF0ZWRXREFCdW5kbGVJZCkgJiYgV0RBX1JVTk5FUl9CVU5ETEVfSUQgIT09IHByb2R1Y3RCdW5kbGVJZGVudGlmaWVyKSB7XG4gICAgICBsb2cuaW5mbyhgV2lsbCB1bmluc3RhbGwgcnVubmluZyBXREEgc2luY2UgaXRzIGJ1bmRsZSBpZCBpcyBub3QgZXF1YWwgdG8gdGhlIGRlZmF1bHQgdmFsdWUgJHtXREFfUlVOTkVSX0JVTkRMRV9JRH1gKTtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnVuaW5zdGFsbCgpO1xuICAgIH1cblxuICAgIGNvbnN0IGFjdHVhbFVwZ3JhZGVUaW1lc3RhbXAgPSBhd2FpdCBnZXRXREFVcGdyYWRlVGltZXN0YW1wKHRoaXMuYm9vdHN0cmFwUGF0aCk7XG4gICAgbG9nLmRlYnVnKGBVcGdyYWRlIHRpbWVzdGFtcCBvZiB0aGUgY3VycmVudGx5IGJ1bmRsZWQgV0RBOiAke2FjdHVhbFVwZ3JhZGVUaW1lc3RhbXB9YCk7XG4gICAgbG9nLmRlYnVnKGBVcGdyYWRlIHRpbWVzdGFtcCBvZiB0aGUgV0RBIG9uIHRoZSBkZXZpY2U6ICR7dXBncmFkZWRBdH1gKTtcbiAgICBpZiAoYWN0dWFsVXBncmFkZVRpbWVzdGFtcCAmJiB1cGdyYWRlZEF0ICYmIF8udG9Mb3dlcihgJHthY3R1YWxVcGdyYWRlVGltZXN0YW1wfWApICE9PSBfLnRvTG93ZXIoYCR7dXBncmFkZWRBdH1gKSkge1xuICAgICAgbG9nLmluZm8oJ1dpbGwgdW5pbnN0YWxsIHJ1bm5pbmcgV0RBIHNpbmNlIGl0IGhhcyBkaWZmZXJlbnQgdmVyc2lvbiBpbiBjb21wYXJpc29uIHRvIHRoZSBvbmUgJyArXG4gICAgICAgIGB3aGljaCBpcyBidW5kbGVkIHdpdGggYXBwaXVtLXhjdWl0ZXN0LWRyaXZlciBtb2R1bGUgKCR7YWN0dWFsVXBncmFkZVRpbWVzdGFtcH0gIT0gJHt1cGdyYWRlZEF0fSlgKTtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnVuaW5zdGFsbCgpO1xuICAgIH1cblxuICAgIGNvbnN0IG1lc3NhZ2UgPSB1dGlsLmhhc1ZhbHVlKHByb2R1Y3RCdW5kbGVJZGVudGlmaWVyKVxuICAgICAgPyBgV2lsbCByZXVzZSBwcmV2aW91c2x5IGNhY2hlZCBXREEgaW5zdGFuY2UgYXQgJyR7dGhpcy51cmwuaHJlZn0nIHdpdGggJyR7cHJvZHVjdEJ1bmRsZUlkZW50aWZpZXJ9J2BcbiAgICAgIDogYFdpbGwgcmV1c2UgcHJldmlvdXNseSBjYWNoZWQgV0RBIGluc3RhbmNlIGF0ICcke3RoaXMudXJsLmhyZWZ9J2A7XG4gICAgbG9nLmluZm8oYCR7bWVzc2FnZX0uIFNldCB0aGUgd2RhTG9jYWxQb3J0IGNhcGFiaWxpdHkgdG8gYSB2YWx1ZSBkaWZmZXJlbnQgZnJvbSAke3RoaXMudXJsLnBvcnR9IGlmIHRoaXMgaXMgYW4gdW5kZXNpcmVkIGJlaGF2aW9yLmApO1xuICAgIHRoaXMud2ViRHJpdmVyQWdlbnRVcmwgPSB0aGlzLnVybC5ocmVmO1xuICB9XG5cbiAgLyoqXG4gICAqIFF1aXQgYW5kIHVuaW5zdGFsbCBydW5uaW5nIFdEQS5cbiAgICovXG4gIGFzeW5jIHF1aXRBbmRVbmluc3RhbGwgKCkge1xuICAgIGF3YWl0IHRoaXMucXVpdCgpO1xuICAgIGF3YWl0IHRoaXMudW5pbnN0YWxsKCk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgV2ViRHJpdmVyQWdlbnQ7XG5leHBvcnQgeyBXZWJEcml2ZXJBZ2VudCB9O1xuIl0sImZpbGUiOiJsaWIvd2ViZHJpdmVyYWdlbnQuanMiLCJzb3VyY2VSb290IjoiLi4vLi4ifQ==
