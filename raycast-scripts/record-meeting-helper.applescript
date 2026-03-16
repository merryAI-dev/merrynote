tell application id "com.apple.VoiceMemos" to activate

tell application "System Events"
    tell process "VoiceMemos"
        -- Wait for window to appear
        set maxWait to 20
        set waited to 0
        repeat while waited < maxWait
            try
                if exists window 1 then exit repeat
            end try
            delay 0.5
            set waited to waited + 1
        end repeat

        set frontmost to true

        -- Retry to find and click the record button (size < 100, description contains 녹음)
        set clicked to false
        set retries to 0
        repeat while retries < 10 and clicked is false
            delay 1
            try
                set allElems to entire contents of window 1
                repeat with elem in allElems
                    try
                        if class of elem is button then
                            set d to description of elem
                            set s to size of elem
                            if d contains "녹음" and (item 1 of s) < 100 then
                                click elem
                                set clicked to true
                                exit repeat
                            end if
                        end if
                    end try
                end repeat
            end try
            set retries to retries + 1
        end repeat
    end tell
end tell
