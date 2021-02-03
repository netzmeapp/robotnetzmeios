*** Settings ***
Documentation    Positive Trulike
Library           AppiumLibrary
Resource          ../../config/device.robot
Resource          ../../keyword/initiate.robot
Resource          ../../keyword/PIN.robot

*** Test Cases ***
Trulike
    [Tags]    smokeTest
	Open Test Application
	open tab following
	give a trulike
	Input Pin Success
	cek response sukses

*** Keywords ***
open tab following
	 tap  //XCUIElementTypeButton[@name="Following"]

give a trulike
     tap  //XCUIElementTypeButton[@name="iconTrulikeBtn"]
     tap  //XCUIElementTypeButton[@name="PAY"]

