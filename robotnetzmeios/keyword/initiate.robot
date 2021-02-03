*** Keywords ***
Open Test Application
  Open Application   ${REMOTE_URL}  platformName=${PLATFORM_NAME}  platformVersion=${PLATFORM_VERSION}  deviceName=${DEVICE_NAME}  bundleId=${BUNDLE_ID}  automationName=${AUTOMATION_NAME}  udid=${UDID}
                       	...               xcodeorgid=${XCODE_ORG_ID}    xcodesigningid=${XCODE_SIGNING_ID}

