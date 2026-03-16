on run argv
    set meetingTitle to item 1 of argv

    tell application "System Events"
        tell process "VoiceMemos"
            set frontmost to true

            -- Step 1: Click 완료 button (size > 0 means visible)
            set clicked to false
            set allElems to entire contents of window 1
            repeat with elem in allElems
                try
                    if class of elem is button and description of elem is "완료" then
                        set s to size of elem
                        if (item 1 of s) > 0 then
                            click elem
                            set clicked to true
                            exit repeat
                        end if
                    end if
                end try
            end repeat

            if not clicked then
                return "ERROR: 완료 버튼을 찾을 수 없습니다. 녹음 중인 상태인지 확인하세요."
            end if

            -- Step 2: Wait for transcript generation by polling 전사문 button + checking text
            delay 5

            set transcriptText to ""
            set waitCount to 0
            repeat while waitCount < 30
                -- Click 전사문 button in toolbar
                set allElems to entire contents of window 1
                repeat with elem in allElems
                    try
                        if class of elem is button and description of elem is "전사문" then
                            click elem
                            exit repeat
                        end if
                    end try
                end repeat

                delay 2

                -- Check if 전사문 보기 has actual transcript content
                set allElems to entire contents of window 1
                repeat with elem in allElems
                    try
                        if class of elem is static text and description of elem is "전사문 보기" then
                            set tv to value of elem
                            if tv is not missing value and tv is not "" then
                                if tv does not contain "전사할 수 없음" then
                                    set transcriptText to tv
                                end if
                            end if
                            exit repeat
                        end if
                    end try
                end repeat

                if transcriptText is not "" then exit repeat

                set waitCount to waitCount + 1
                delay 2
            end repeat

            if transcriptText is "" then
                return "ERROR: 전사문 생성 시간이 초과되었습니다 (120초). 수동으로 확인하세요."
            end if

            -- Step 3: Rename the recording with the meeting title
            delay 0.5
            set allElems to entire contents of window 1
            repeat with elem in allElems
                try
                    if class of elem is text field then
                        set d to description of elem
                        set s to size of elem
                        if d is "텍스트 필드" and (item 1 of s) > 80 and (item 1 of s) < 300 then
                            set focused of elem to true
                            set value of elem to meetingTitle
                            key code 36
                            exit repeat
                        end if
                    end if
                end try
            end repeat

            return transcriptText
        end tell
    end tell
end run
