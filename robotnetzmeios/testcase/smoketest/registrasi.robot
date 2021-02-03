
*** Settings ***
Documentation    Positive registration
Library           AppiumLibrary
Resource          ../../config/device.robot
Resource          ../../keyword/initiate.robot
Resource          ../../keyword/checkPermission.robot



*** Variables ***
${term_condition}   //XCUIElementTypeWebView[@name="termConditionText"]


*** Test Cases ***
Registrasi baru Test
    [Tags]    smokeTest

	Open Test Application
	Run Keyword And Ignore Error  accept notification permission
    Repeat Keyword    3 times   read term & condition
    Repeat Keyword    2 times  agree term & condition
    input phone number user
    input verification code
    Run Keyword And Ignore Error  accept contact permission
    setup profile user




*** Keywords ***
read term & condition
       #wait until element is Visible     ${term_condition}
        ${element_size}=    Get Element Size    ${term_condition}
        ${element_location}=    Get Element Location    ${term_condition}
        ${start_x}=         Evaluate      ${element_location['x']} + (${element_size['width']} * 0.5)
        ${start_y}=         Evaluate      ${element_location['y']} + (${element_size['height']} * 0.9)
        ${end_x}=           Evaluate      ${element_location['x']} + (${element_size['width']} * 0.5)
        ${end_y}=           Evaluate      ${element_location['y']} + (${element_size['height']} * 0.1)
        Swipe               ${start_x}    ${start_y}  ${end_x}  ${end_y}  100


agree term & condition

       wait until element is Visible     //XCUIElementTypeButton[@name="I have read and agree to Netzme’s Terms & Conditions"]

       ##wait until element is Enable     xpath=//XCUIElementTypeApplication[@name="Netzme STG"]/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[3]/XCUIElementTypeOther[1]

       ##click element   xpath=//XCUIElementTypeApplication[@name="Netzme STG"]/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[3]/XCUIElementTypeOther[1]

       ##click element   xpath=//XCUIsElementTypeOther[@name="checklistAgreement"]
       click element   xpath=//XCUIElementTypeButton[@name="I have read and agree to Netzme’s Terms & Conditions"]

       #Click Element At Coordinates   coordinate_X=16   coordinate_Y=552
       click element   xpath=//XCUIElementTypeButton[@name="CONTINUE"]

input phone number user

       input value   //XCUIElementTypeTextField[@name="phoneNumberInput"]   "085208528076"
       click text  Done
       tap   //XCUIElementTypeStaticText[@name="START!"]


input verification code
       wait until element is Visible   //XCUIElementTypeTextField[@name="otpInput"]   10s
       input value   //XCUIElementTypeTextField[@name="otpInput"]   0000
       click text  Done
       tap   //XCUIElementTypeButton[@name="VERIFY"]

setup profile user
       wait until page contains element   //XCUIElementTypeTextField[@name="fullnameInput"]   30 Seconds
       input value   //XCUIElementTypeTextField[@name="fullnameInput"]   autodongs
       tap    //XCUIElementTypeButton[@name="SAVE"]
