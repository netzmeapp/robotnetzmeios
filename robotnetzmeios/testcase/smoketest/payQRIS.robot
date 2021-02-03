*** Settings ***
Documentation    Payment QRIS
Library           AppiumLibrary
Resource          ../../config/device.robot
Resource          ../../keyword/initiate.robot
Resource          ../../keyword/PIN.robot

*** Test Cases ***
Scan QRIS static & pay
    [Tags]    Payment
	Open Test Application
	open smart button menu
	#Open camera Scan QR
	get QR from file
	Tap button pay
	Input Pin Success

*** Keywords ***
open smart button menu
  click element   //XCUIElementTypeApplication[@name="Netzme STG"]/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeTabBar/XCUIElementTypeButton[3]

Open camera Scan QR

  click element   //XCUIElementTypeButton[@name="smartMenuQR"]

get QR from file

  wait until element is visible  //XCUIElementTypeStaticText[@name="SCAN QR"]  20s

  click element   //XCUIElementTypeButton[@name="camera gallery"]

  click element   //XCUIElementTypeApplication[@name="Netzme STG"]/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeCollectionView/XCUIElementTypeCell[4]/XCUIElementTypeOther/XCUIElementTypeImage

Tap button pay
  wait until element is visible  //XCUIElementTypeButton[@name="PAY"]  20s

  click element  //XCUIElementTypeButton[@name="PAY"]