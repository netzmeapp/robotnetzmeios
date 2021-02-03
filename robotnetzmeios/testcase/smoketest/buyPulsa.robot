*** Settings ***
Documentation    Positive Buy Pulsa
Library           AppiumLibrary
Resource          ../../config/device.robot
Resource          ../../keyword/initiate.robot
Resource          ../../keyword/PIN.robot

*** Test Cases ***
Pembelian Pulsa

	Open Test Application
	Open Menu Payment
	Open Menu Pay & Purchase
	#Open Sub Menu Buy Pulsa


*** Keywords ***
Open Menu Payment
     click element  //XCUIElementTypeApplication[@name="Netzme STG"]/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeTabBar/XCUIElementTypeButton[5]


Open Menu Pay & Purchase

    tap   //XCUIElementTypeApplication[@name="Netzme STG"]/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeTable/XCUIElementTypeCell[1]
    ...    x_offset=114   y_offset=130   count=1

Open Sub Menu Buy Pulsa
    click text  Buy Pulsa