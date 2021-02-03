*** Variables ***
${askForNotification}   //XCUIElementTypeAlert[@name="“Netzme STG” Would Like to Send You Notifications"]
${btnAllow}   //XCUIElementTypeButton[@name="Allow"]
${btnIgnore}   //XCUIElementTypeButton[@name="Don’t Allow"]
${IsAskForNotificationVisible}   Run Keyword And Return Status    Element Should Be Visible   ${askForNotification}




${askForContact}   //XCUIElementTypeAlert[@name="“Netzme STG” Would Like to Access Your Contacts"]
${btnOk}    //XCUIElementTypeButton[@name="OK"]
${IsAskForContactVisible}   Run Keyword And Return Status    Element Should Be Visible  ${askForContact}



*** Keywords ***
accept notification permission
    Run Keyword If   ${IsAskForNotificationVisible}   tap  ${btnAllow}

ignore notification permission
    Run Keyword If    ${IsAskForNotificationVisible}   tap  ${btnIgnore}

accept contact permission
    Run Keyword If   ${IsAskForContactVisible}   tap  ${btnOk}   10 Seconds

ignore contact permission
    Run Keyword If With Maximum Time   10 Seconds    ${IsAskForContactVisible}   tap  ${btnIgnore}



