"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.checkForDependencies = checkForDependencies;
exports.bundleWDASim = bundleWDASim;

require("source-map-support/register");

var _appiumSupport = require("appium-support");

var _nodeSimctl = _interopRequireDefault(require("node-simctl"));

var _lodash = _interopRequireDefault(require("lodash"));

var _teen_process = require("teen_process");

var _path = _interopRequireDefault(require("path"));

var _os = require("os");

var _utils = require("./utils");

var _xcodebuild = _interopRequireDefault(require("./xcodebuild"));

var _constants = require("./constants");

var _logger = _interopRequireDefault(require("./logger"));

const execLogger = {
  logNonEmptyLines(data, fn) {
    data = Buffer.isBuffer(data) ? data.toString() : data;

    for (const line of data.split(_os.EOL)) {
      if (line) {
        fn(line);
      }
    }
  },

  debug(data) {
    this.logNonEmptyLines(data, _logger.default.debug.bind(_logger.default));
  },

  error(data) {
    this.logNonEmptyLines(data, _logger.default.error.bind(_logger.default));
  }

};
const IOS = 'iOS';
const TVOS = 'tvOS';
const CARTHAGE_CMD = 'carthage';
const CARTFILE = 'Cartfile.resolved';

async function hasTvOSSims() {
  const devices = _lodash.default.flatten(Object.values(await new _nodeSimctl.default().getDevices(null, TVOS)));

  return !_lodash.default.isEmpty(devices);
}

function getCartfileLocations() {
  const cartfile = _path.default.resolve(_constants.BOOTSTRAP_PATH, CARTFILE);

  const installedCartfile = _path.default.resolve(_constants.BOOTSTRAP_PATH, _constants.CARTHAGE_ROOT, CARTFILE);

  return {
    cartfile,
    installedCartfile
  };
}

async function needsUpdate(cartfile, installedCartfile) {
  return !(await (0, _utils.areFilesEqual)(cartfile, installedCartfile));
}

async function fetchDependencies(useSsl = false) {
  _logger.default.info('Fetching dependencies');

  if (!(await _appiumSupport.fs.which(CARTHAGE_CMD))) {
    _logger.default.errorAndThrow('Please make sure that you have Carthage installed ' + '(https://github.com/Carthage/Carthage), and that it is ' + 'available in the PATH for the environment running Appium');
  }

  const {
    cartfile,
    installedCartfile
  } = getCartfileLocations();

  if (!(await needsUpdate(cartfile, installedCartfile))) {
    _logger.default.info('Dependencies up-to-date');

    return false;
  }

  let platforms = [IOS];

  if (await hasTvOSSims()) {
    platforms.push(TVOS);
  } else {
    _logger.default.debug('tvOS platform will not be included into Carthage bootstrap, because no Simulator devices have been created for it');
  }

  _logger.default.info(`Installing/updating dependencies for platforms ${platforms.map(p => `'${p}'`).join(', ')}`);

  let args = ['bootstrap'];

  if (useSsl) {
    args.push('--use-ssh');
  }

  args.push('--platform', platforms.join(','));

  try {
    await (0, _teen_process.exec)(CARTHAGE_CMD, args, {
      logger: execLogger,
      cwd: _constants.BOOTSTRAP_PATH
    });
  } catch (err) {
    await _appiumSupport.fs.rimraf(_path.default.resolve(_constants.BOOTSTRAP_PATH, _constants.CARTHAGE_ROOT));
    throw err;
  }

  await _appiumSupport.fs.copyFile(cartfile, installedCartfile);

  _logger.default.debug(`Finished fetching dependencies`);

  return true;
}

async function buildWDASim() {
  const args = ['-project', _constants.WDA_PROJECT, '-scheme', _constants.WDA_SCHEME, '-sdk', _constants.SDK_SIMULATOR, 'CODE_SIGN_IDENTITY=""', 'CODE_SIGNING_REQUIRED="NO"', 'GCC_TREAT_WARNINGS_AS_ERRORS=0'];
  await (0, _teen_process.exec)('xcodebuild', args);
}

async function checkForDependencies(opts = {}) {
  return await fetchDependencies(opts.useSsl);
}

async function bundleWDASim(xcodebuild, opts = {}) {
  if (xcodebuild && !_lodash.default.isFunction(xcodebuild.retrieveDerivedDataPath)) {
    xcodebuild = new _xcodebuild.default();
    opts = xcodebuild;
  }

  const derivedDataPath = await xcodebuild.retrieveDerivedDataPath();

  const wdaBundlePath = _path.default.join(derivedDataPath, 'Build', 'Products', 'Debug-iphonesimulator', _constants.WDA_RUNNER_APP);

  if (await _appiumSupport.fs.exists(wdaBundlePath)) {
    return wdaBundlePath;
  }

  await checkForDependencies(opts);
  await buildWDASim(xcodebuild, opts);
  return wdaBundlePath;
}require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9jaGVjay1kZXBlbmRlbmNpZXMuanMiXSwibmFtZXMiOlsiZXhlY0xvZ2dlciIsImxvZ05vbkVtcHR5TGluZXMiLCJkYXRhIiwiZm4iLCJCdWZmZXIiLCJpc0J1ZmZlciIsInRvU3RyaW5nIiwibGluZSIsInNwbGl0IiwiRU9MIiwiZGVidWciLCJsb2ciLCJiaW5kIiwiZXJyb3IiLCJJT1MiLCJUVk9TIiwiQ0FSVEhBR0VfQ01EIiwiQ0FSVEZJTEUiLCJoYXNUdk9TU2ltcyIsImRldmljZXMiLCJfIiwiZmxhdHRlbiIsIk9iamVjdCIsInZhbHVlcyIsIlNpbWN0bCIsImdldERldmljZXMiLCJpc0VtcHR5IiwiZ2V0Q2FydGZpbGVMb2NhdGlvbnMiLCJjYXJ0ZmlsZSIsInBhdGgiLCJyZXNvbHZlIiwiQk9PVFNUUkFQX1BBVEgiLCJpbnN0YWxsZWRDYXJ0ZmlsZSIsIkNBUlRIQUdFX1JPT1QiLCJuZWVkc1VwZGF0ZSIsImZldGNoRGVwZW5kZW5jaWVzIiwidXNlU3NsIiwiaW5mbyIsImZzIiwid2hpY2giLCJlcnJvckFuZFRocm93IiwicGxhdGZvcm1zIiwicHVzaCIsIm1hcCIsInAiLCJqb2luIiwiYXJncyIsImxvZ2dlciIsImN3ZCIsImVyciIsInJpbXJhZiIsImNvcHlGaWxlIiwiYnVpbGRXREFTaW0iLCJXREFfUFJPSkVDVCIsIldEQV9TQ0hFTUUiLCJTREtfU0lNVUxBVE9SIiwiY2hlY2tGb3JEZXBlbmRlbmNpZXMiLCJvcHRzIiwiYnVuZGxlV0RBU2ltIiwieGNvZGVidWlsZCIsImlzRnVuY3Rpb24iLCJyZXRyaWV2ZURlcml2ZWREYXRhUGF0aCIsIlhjb2RlQnVpbGQiLCJkZXJpdmVkRGF0YVBhdGgiLCJ3ZGFCdW5kbGVQYXRoIiwiV0RBX1JVTk5FUl9BUFAiLCJleGlzdHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUlBOztBQUdBLE1BQU1BLFVBQVUsR0FBRztBQUVqQkMsRUFBQUEsZ0JBQWdCLENBQUVDLElBQUYsRUFBUUMsRUFBUixFQUFZO0FBQzFCRCxJQUFBQSxJQUFJLEdBQUdFLE1BQU0sQ0FBQ0MsUUFBUCxDQUFnQkgsSUFBaEIsSUFBd0JBLElBQUksQ0FBQ0ksUUFBTCxFQUF4QixHQUEwQ0osSUFBakQ7O0FBQ0EsU0FBSyxNQUFNSyxJQUFYLElBQW1CTCxJQUFJLENBQUNNLEtBQUwsQ0FBV0MsT0FBWCxDQUFuQixFQUFvQztBQUNsQyxVQUFJRixJQUFKLEVBQVU7QUFDUkosUUFBQUEsRUFBRSxDQUFDSSxJQUFELENBQUY7QUFDRDtBQUNGO0FBQ0YsR0FUZ0I7O0FBVWpCRyxFQUFBQSxLQUFLLENBQUVSLElBQUYsRUFBUTtBQUNYLFNBQUtELGdCQUFMLENBQXNCQyxJQUF0QixFQUE0QlMsZ0JBQUlELEtBQUosQ0FBVUUsSUFBVixDQUFlRCxlQUFmLENBQTVCO0FBQ0QsR0FaZ0I7O0FBYWpCRSxFQUFBQSxLQUFLLENBQUVYLElBQUYsRUFBUTtBQUNYLFNBQUtELGdCQUFMLENBQXNCQyxJQUF0QixFQUE0QlMsZ0JBQUlFLEtBQUosQ0FBVUQsSUFBVixDQUFlRCxlQUFmLENBQTVCO0FBQ0Q7O0FBZmdCLENBQW5CO0FBa0JBLE1BQU1HLEdBQUcsR0FBRyxLQUFaO0FBQ0EsTUFBTUMsSUFBSSxHQUFHLE1BQWI7QUFFQSxNQUFNQyxZQUFZLEdBQUcsVUFBckI7QUFDQSxNQUFNQyxRQUFRLEdBQUcsbUJBQWpCOztBQUVBLGVBQWVDLFdBQWYsR0FBOEI7QUFDNUIsUUFBTUMsT0FBTyxHQUFHQyxnQkFBRUMsT0FBRixDQUFVQyxNQUFNLENBQUNDLE1BQVAsQ0FBYyxNQUFNLElBQUlDLG1CQUFKLEdBQWFDLFVBQWIsQ0FBd0IsSUFBeEIsRUFBOEJWLElBQTlCLENBQXBCLENBQVYsQ0FBaEI7O0FBQ0EsU0FBTyxDQUFDSyxnQkFBRU0sT0FBRixDQUFVUCxPQUFWLENBQVI7QUFDRDs7QUFFRCxTQUFTUSxvQkFBVCxHQUFpQztBQUMvQixRQUFNQyxRQUFRLEdBQUdDLGNBQUtDLE9BQUwsQ0FBYUMseUJBQWIsRUFBNkJkLFFBQTdCLENBQWpCOztBQUNBLFFBQU1lLGlCQUFpQixHQUFHSCxjQUFLQyxPQUFMLENBQWFDLHlCQUFiLEVBQTZCRSx3QkFBN0IsRUFBNENoQixRQUE1QyxDQUExQjs7QUFFQSxTQUFPO0FBQ0xXLElBQUFBLFFBREs7QUFFTEksSUFBQUE7QUFGSyxHQUFQO0FBSUQ7O0FBRUQsZUFBZUUsV0FBZixDQUE0Qk4sUUFBNUIsRUFBc0NJLGlCQUF0QyxFQUF5RDtBQUN2RCxTQUFPLEVBQUMsTUFBTSwwQkFBY0osUUFBZCxFQUF3QkksaUJBQXhCLENBQVAsQ0FBUDtBQUNEOztBQUVELGVBQWVHLGlCQUFmLENBQWtDQyxNQUFNLEdBQUcsS0FBM0MsRUFBa0Q7QUFDaER6QixrQkFBSTBCLElBQUosQ0FBUyx1QkFBVDs7QUFDQSxNQUFJLEVBQUMsTUFBTUMsa0JBQUdDLEtBQUgsQ0FBU3ZCLFlBQVQsQ0FBUCxDQUFKLEVBQW1DO0FBQ2pDTCxvQkFBSTZCLGFBQUosQ0FBa0IsdURBQ0EseURBREEsR0FFQSwwREFGbEI7QUFHRDs7QUFHRCxRQUFNO0FBQ0paLElBQUFBLFFBREk7QUFFSkksSUFBQUE7QUFGSSxNQUdGTCxvQkFBb0IsRUFIeEI7O0FBS0EsTUFBSSxFQUFDLE1BQU1PLFdBQVcsQ0FBQ04sUUFBRCxFQUFXSSxpQkFBWCxDQUFsQixDQUFKLEVBQXFEO0FBRW5EckIsb0JBQUkwQixJQUFKLENBQVMseUJBQVQ7O0FBQ0EsV0FBTyxLQUFQO0FBQ0Q7O0FBRUQsTUFBSUksU0FBUyxHQUFHLENBQUMzQixHQUFELENBQWhCOztBQUNBLE1BQUksTUFBTUksV0FBVyxFQUFyQixFQUF5QjtBQUN2QnVCLElBQUFBLFNBQVMsQ0FBQ0MsSUFBVixDQUFlM0IsSUFBZjtBQUNELEdBRkQsTUFFTztBQUNMSixvQkFBSUQsS0FBSixDQUFVLG1IQUFWO0FBQ0Q7O0FBRURDLGtCQUFJMEIsSUFBSixDQUFVLGtEQUFpREksU0FBUyxDQUFDRSxHQUFWLENBQWVDLENBQUQsSUFBUSxJQUFHQSxDQUFFLEdBQTNCLEVBQStCQyxJQUEvQixDQUFvQyxJQUFwQyxDQUEwQyxFQUFyRzs7QUFFQSxNQUFJQyxJQUFJLEdBQUcsQ0FBQyxXQUFELENBQVg7O0FBQ0EsTUFBSVYsTUFBSixFQUFZO0FBQ1ZVLElBQUFBLElBQUksQ0FBQ0osSUFBTCxDQUFVLFdBQVY7QUFDRDs7QUFDREksRUFBQUEsSUFBSSxDQUFDSixJQUFMLENBQVUsWUFBVixFQUF3QkQsU0FBUyxDQUFDSSxJQUFWLENBQWUsR0FBZixDQUF4Qjs7QUFDQSxNQUFJO0FBQ0YsVUFBTSx3QkFBSzdCLFlBQUwsRUFBbUI4QixJQUFuQixFQUF5QjtBQUM3QkMsTUFBQUEsTUFBTSxFQUFFL0MsVUFEcUI7QUFFN0JnRCxNQUFBQSxHQUFHLEVBQUVqQjtBQUZ3QixLQUF6QixDQUFOO0FBSUQsR0FMRCxDQUtFLE9BQU9rQixHQUFQLEVBQVk7QUFHWixVQUFNWCxrQkFBR1ksTUFBSCxDQUFVckIsY0FBS0MsT0FBTCxDQUFhQyx5QkFBYixFQUE2QkUsd0JBQTdCLENBQVYsQ0FBTjtBQUNBLFVBQU1nQixHQUFOO0FBQ0Q7O0FBR0QsUUFBTVgsa0JBQUdhLFFBQUgsQ0FBWXZCLFFBQVosRUFBc0JJLGlCQUF0QixDQUFOOztBQUVBckIsa0JBQUlELEtBQUosQ0FBVyxnQ0FBWDs7QUFDQSxTQUFPLElBQVA7QUFDRDs7QUFFRCxlQUFlMEMsV0FBZixHQUE4QjtBQUM1QixRQUFNTixJQUFJLEdBQUcsQ0FDWCxVQURXLEVBQ0NPLHNCQURELEVBRVgsU0FGVyxFQUVBQyxxQkFGQSxFQUdYLE1BSFcsRUFHSEMsd0JBSEcsRUFJWCx1QkFKVyxFQUtYLDRCQUxXLEVBTVgsZ0NBTlcsQ0FBYjtBQVFBLFFBQU0sd0JBQUssWUFBTCxFQUFtQlQsSUFBbkIsQ0FBTjtBQUNEOztBQUVELGVBQWVVLG9CQUFmLENBQXFDQyxJQUFJLEdBQUcsRUFBNUMsRUFBZ0Q7QUFDOUMsU0FBTyxNQUFNdEIsaUJBQWlCLENBQUNzQixJQUFJLENBQUNyQixNQUFOLENBQTlCO0FBQ0Q7O0FBRUQsZUFBZXNCLFlBQWYsQ0FBNkJDLFVBQTdCLEVBQXlDRixJQUFJLEdBQUcsRUFBaEQsRUFBb0Q7QUFDbEQsTUFBSUUsVUFBVSxJQUFJLENBQUN2QyxnQkFBRXdDLFVBQUYsQ0FBYUQsVUFBVSxDQUFDRSx1QkFBeEIsQ0FBbkIsRUFBcUU7QUFDbkVGLElBQUFBLFVBQVUsR0FBRyxJQUFJRyxtQkFBSixFQUFiO0FBQ0FMLElBQUFBLElBQUksR0FBR0UsVUFBUDtBQUNEOztBQUVELFFBQU1JLGVBQWUsR0FBRyxNQUFNSixVQUFVLENBQUNFLHVCQUFYLEVBQTlCOztBQUNBLFFBQU1HLGFBQWEsR0FBR25DLGNBQUtnQixJQUFMLENBQVVrQixlQUFWLEVBQTJCLE9BQTNCLEVBQW9DLFVBQXBDLEVBQWdELHVCQUFoRCxFQUF5RUUseUJBQXpFLENBQXRCOztBQUNBLE1BQUksTUFBTTNCLGtCQUFHNEIsTUFBSCxDQUFVRixhQUFWLENBQVYsRUFBb0M7QUFDbEMsV0FBT0EsYUFBUDtBQUNEOztBQUNELFFBQU1SLG9CQUFvQixDQUFDQyxJQUFELENBQTFCO0FBQ0EsUUFBTUwsV0FBVyxDQUFDTyxVQUFELEVBQWFGLElBQWIsQ0FBakI7QUFDQSxTQUFPTyxhQUFQO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBmcyB9IGZyb20gJ2FwcGl1bS1zdXBwb3J0JztcbmltcG9ydCBTaW1jdGwgZnJvbSAnbm9kZS1zaW1jdGwnO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IGV4ZWMgfSBmcm9tICd0ZWVuX3Byb2Nlc3MnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBhcmVGaWxlc0VxdWFsIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgWGNvZGVCdWlsZCBmcm9tICcuL3hjb2RlYnVpbGQnO1xuaW1wb3J0IHtcbiAgQk9PVFNUUkFQX1BBVEgsIFdEQV9QUk9KRUNULCBXREFfU0NIRU1FLCBDQVJUSEFHRV9ST09ULCBTREtfU0lNVUxBVE9SLFxuICBXREFfUlVOTkVSX0FQUCxcbn0gZnJvbSAnLi9jb25zdGFudHMnO1xuaW1wb3J0IGxvZyBmcm9tICcuL2xvZ2dlcic7XG5cblxuY29uc3QgZXhlY0xvZ2dlciA9IHtcbiAgLy8gbG9nZ2VyIHRoYXQgZ2V0cyByaWQgb2YgZW1wdHkgbGluZXNcbiAgbG9nTm9uRW1wdHlMaW5lcyAoZGF0YSwgZm4pIHtcbiAgICBkYXRhID0gQnVmZmVyLmlzQnVmZmVyKGRhdGEpID8gZGF0YS50b1N0cmluZygpIDogZGF0YTtcbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgZGF0YS5zcGxpdChFT0wpKSB7XG4gICAgICBpZiAobGluZSkge1xuICAgICAgICBmbihsaW5lKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gIGRlYnVnIChkYXRhKSB7XG4gICAgdGhpcy5sb2dOb25FbXB0eUxpbmVzKGRhdGEsIGxvZy5kZWJ1Zy5iaW5kKGxvZykpO1xuICB9LFxuICBlcnJvciAoZGF0YSkge1xuICAgIHRoaXMubG9nTm9uRW1wdHlMaW5lcyhkYXRhLCBsb2cuZXJyb3IuYmluZChsb2cpKTtcbiAgfSxcbn07XG5cbmNvbnN0IElPUyA9ICdpT1MnO1xuY29uc3QgVFZPUyA9ICd0dk9TJztcblxuY29uc3QgQ0FSVEhBR0VfQ01EID0gJ2NhcnRoYWdlJztcbmNvbnN0IENBUlRGSUxFID0gJ0NhcnRmaWxlLnJlc29sdmVkJztcblxuYXN5bmMgZnVuY3Rpb24gaGFzVHZPU1NpbXMgKCkge1xuICBjb25zdCBkZXZpY2VzID0gXy5mbGF0dGVuKE9iamVjdC52YWx1ZXMoYXdhaXQgbmV3IFNpbWN0bCgpLmdldERldmljZXMobnVsbCwgVFZPUykpKTtcbiAgcmV0dXJuICFfLmlzRW1wdHkoZGV2aWNlcyk7XG59XG5cbmZ1bmN0aW9uIGdldENhcnRmaWxlTG9jYXRpb25zICgpIHtcbiAgY29uc3QgY2FydGZpbGUgPSBwYXRoLnJlc29sdmUoQk9PVFNUUkFQX1BBVEgsIENBUlRGSUxFKTtcbiAgY29uc3QgaW5zdGFsbGVkQ2FydGZpbGUgPSBwYXRoLnJlc29sdmUoQk9PVFNUUkFQX1BBVEgsIENBUlRIQUdFX1JPT1QsIENBUlRGSUxFKTtcblxuICByZXR1cm4ge1xuICAgIGNhcnRmaWxlLFxuICAgIGluc3RhbGxlZENhcnRmaWxlLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBuZWVkc1VwZGF0ZSAoY2FydGZpbGUsIGluc3RhbGxlZENhcnRmaWxlKSB7XG4gIHJldHVybiAhYXdhaXQgYXJlRmlsZXNFcXVhbChjYXJ0ZmlsZSwgaW5zdGFsbGVkQ2FydGZpbGUpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmZXRjaERlcGVuZGVuY2llcyAodXNlU3NsID0gZmFsc2UpIHtcbiAgbG9nLmluZm8oJ0ZldGNoaW5nIGRlcGVuZGVuY2llcycpO1xuICBpZiAoIWF3YWl0IGZzLndoaWNoKENBUlRIQUdFX0NNRCkpIHtcbiAgICBsb2cuZXJyb3JBbmRUaHJvdygnUGxlYXNlIG1ha2Ugc3VyZSB0aGF0IHlvdSBoYXZlIENhcnRoYWdlIGluc3RhbGxlZCAnICtcbiAgICAgICAgICAgICAgICAgICAgICAnKGh0dHBzOi8vZ2l0aHViLmNvbS9DYXJ0aGFnZS9DYXJ0aGFnZSksIGFuZCB0aGF0IGl0IGlzICcgK1xuICAgICAgICAgICAgICAgICAgICAgICdhdmFpbGFibGUgaW4gdGhlIFBBVEggZm9yIHRoZSBlbnZpcm9ubWVudCBydW5uaW5nIEFwcGl1bScpO1xuICB9XG5cbiAgLy8gY2hlY2sgdGhhdCB0aGUgZGVwZW5kZW5jaWVzIGRvIG5vdCBuZWVkIHRvIGJlIHVwZGF0ZWRcbiAgY29uc3Qge1xuICAgIGNhcnRmaWxlLFxuICAgIGluc3RhbGxlZENhcnRmaWxlLFxuICB9ID0gZ2V0Q2FydGZpbGVMb2NhdGlvbnMoKTtcblxuICBpZiAoIWF3YWl0IG5lZWRzVXBkYXRlKGNhcnRmaWxlLCBpbnN0YWxsZWRDYXJ0ZmlsZSkpIHtcbiAgICAvLyBmaWxlcyBhcmUgaWRlbnRpY2FsXG4gICAgbG9nLmluZm8oJ0RlcGVuZGVuY2llcyB1cC10by1kYXRlJyk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgbGV0IHBsYXRmb3JtcyA9IFtJT1NdO1xuICBpZiAoYXdhaXQgaGFzVHZPU1NpbXMoKSkge1xuICAgIHBsYXRmb3Jtcy5wdXNoKFRWT1MpO1xuICB9IGVsc2Uge1xuICAgIGxvZy5kZWJ1ZygndHZPUyBwbGF0Zm9ybSB3aWxsIG5vdCBiZSBpbmNsdWRlZCBpbnRvIENhcnRoYWdlIGJvb3RzdHJhcCwgYmVjYXVzZSBubyBTaW11bGF0b3IgZGV2aWNlcyBoYXZlIGJlZW4gY3JlYXRlZCBmb3IgaXQnKTtcbiAgfVxuXG4gIGxvZy5pbmZvKGBJbnN0YWxsaW5nL3VwZGF0aW5nIGRlcGVuZGVuY2llcyBmb3IgcGxhdGZvcm1zICR7cGxhdGZvcm1zLm1hcCgocCkgPT4gYCcke3B9J2ApLmpvaW4oJywgJyl9YCk7XG5cbiAgbGV0IGFyZ3MgPSBbJ2Jvb3RzdHJhcCddO1xuICBpZiAodXNlU3NsKSB7XG4gICAgYXJncy5wdXNoKCctLXVzZS1zc2gnKTtcbiAgfVxuICBhcmdzLnB1c2goJy0tcGxhdGZvcm0nLCBwbGF0Zm9ybXMuam9pbignLCcpKTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBleGVjKENBUlRIQUdFX0NNRCwgYXJncywge1xuICAgICAgbG9nZ2VyOiBleGVjTG9nZ2VyLFxuICAgICAgY3dkOiBCT09UU1RSQVBfUEFUSCxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gcmVtb3ZlIHRoZSBjYXJ0aGFnZSBkaXJlY3RvcnksIG9yIGVsc2Ugc3Vic2VxdWVudCBydW5zIHdpbGwgc2VlIGl0IGFuZFxuICAgIC8vIGFzc3VtZSB0aGUgZGVwZW5kZW5jaWVzIGFyZSBhbHJlYWR5IGRvd25sb2FkZWRcbiAgICBhd2FpdCBmcy5yaW1yYWYocGF0aC5yZXNvbHZlKEJPT1RTVFJBUF9QQVRILCBDQVJUSEFHRV9ST09UKSk7XG4gICAgdGhyb3cgZXJyO1xuICB9XG5cbiAgLy8gcHV0IHRoZSByZXNvbHZlZCBjYXJ0ZmlsZSBpbnRvIHRoZSBDYXJ0aGFnZSBkaXJlY3RvcnlcbiAgYXdhaXQgZnMuY29weUZpbGUoY2FydGZpbGUsIGluc3RhbGxlZENhcnRmaWxlKTtcblxuICBsb2cuZGVidWcoYEZpbmlzaGVkIGZldGNoaW5nIGRlcGVuZGVuY2llc2ApO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYnVpbGRXREFTaW0gKCkge1xuICBjb25zdCBhcmdzID0gW1xuICAgICctcHJvamVjdCcsIFdEQV9QUk9KRUNULFxuICAgICctc2NoZW1lJywgV0RBX1NDSEVNRSxcbiAgICAnLXNkaycsIFNES19TSU1VTEFUT1IsXG4gICAgJ0NPREVfU0lHTl9JREVOVElUWT1cIlwiJyxcbiAgICAnQ09ERV9TSUdOSU5HX1JFUVVJUkVEPVwiTk9cIicsXG4gICAgJ0dDQ19UUkVBVF9XQVJOSU5HU19BU19FUlJPUlM9MCcsXG4gIF07XG4gIGF3YWl0IGV4ZWMoJ3hjb2RlYnVpbGQnLCBhcmdzKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY2hlY2tGb3JEZXBlbmRlbmNpZXMgKG9wdHMgPSB7fSkge1xuICByZXR1cm4gYXdhaXQgZmV0Y2hEZXBlbmRlbmNpZXMob3B0cy51c2VTc2wpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBidW5kbGVXREFTaW0gKHhjb2RlYnVpbGQsIG9wdHMgPSB7fSkge1xuICBpZiAoeGNvZGVidWlsZCAmJiAhXy5pc0Z1bmN0aW9uKHhjb2RlYnVpbGQucmV0cmlldmVEZXJpdmVkRGF0YVBhdGgpKSB7XG4gICAgeGNvZGVidWlsZCA9IG5ldyBYY29kZUJ1aWxkKCk7XG4gICAgb3B0cyA9IHhjb2RlYnVpbGQ7XG4gIH1cblxuICBjb25zdCBkZXJpdmVkRGF0YVBhdGggPSBhd2FpdCB4Y29kZWJ1aWxkLnJldHJpZXZlRGVyaXZlZERhdGFQYXRoKCk7XG4gIGNvbnN0IHdkYUJ1bmRsZVBhdGggPSBwYXRoLmpvaW4oZGVyaXZlZERhdGFQYXRoLCAnQnVpbGQnLCAnUHJvZHVjdHMnLCAnRGVidWctaXBob25lc2ltdWxhdG9yJywgV0RBX1JVTk5FUl9BUFApO1xuICBpZiAoYXdhaXQgZnMuZXhpc3RzKHdkYUJ1bmRsZVBhdGgpKSB7XG4gICAgcmV0dXJuIHdkYUJ1bmRsZVBhdGg7XG4gIH1cbiAgYXdhaXQgY2hlY2tGb3JEZXBlbmRlbmNpZXMob3B0cyk7XG4gIGF3YWl0IGJ1aWxkV0RBU2ltKHhjb2RlYnVpbGQsIG9wdHMpO1xuICByZXR1cm4gd2RhQnVuZGxlUGF0aDtcbn1cblxuZXhwb3J0IHsgY2hlY2tGb3JEZXBlbmRlbmNpZXMsIGJ1bmRsZVdEQVNpbSB9O1xuIl0sImZpbGUiOiJsaWIvY2hlY2stZGVwZW5kZW5jaWVzLmpzIiwic291cmNlUm9vdCI6Ii4uLy4uIn0=