# 아이폰 ↔ MerryNote 연동 설정 가이드

## 전체 흐름

```
아이폰 녹음 (음성 메모 / Shortcuts)
    → iCloud Drive/merrynote-inbox/ 저장
        → Mac watch-inbox.sh 자동 감지
            → MYSC vocab 주입 → 전사
                → Claude 회의록 생성
                    → ~/meeting-notes/ 저장 + 알림
```

---

## 1단계: Mac에서 감시 시작

```bash
# 백그라운드 실행
nohup <MerryNote-설치경로>/scripts/watch-inbox.sh > /tmp/merrynote-watch.log 2>&1 &
echo $! > /tmp/merrynote-watch.pid
echo "감시 시작됨 (PID: $(cat /tmp/merrynote-watch.pid))"

# 로그 확인
tail -f /tmp/merrynote-watch.log

# 종료할 때
kill $(cat /tmp/merrynote-watch.pid)
```

---

## 2단계: 아이폰 Shortcuts 설정

아이폰에서 **단축어 앱** 열고 새 단축어 만들기:

### 단축어 A: "MYSC 녹음 → MerryNote"
```
1. [마이크로 녹음]
   - 오디오 녹음

2. [iCloud Drive에 저장]
   - 경로: merrynote-inbox
   - 파일명: 현재 날짜 + "-회의"
     (예: 2026-03-17-회의.m4a)
   - 기존 파일 덮어쓰기: 이름 바꾸기

3. [알림]
   - "녹음이 MerryNote로 전송됐어요 ✅"
```

### 단축어 B: "음성 메모 → MerryNote" (기존 녹음 전송)
```
1. [공유 시트에서 받기] — 파일 타입: 오디오

2. [iCloud Drive에 저장]
   - 경로: merrynote-inbox
   - 파일명: 입력한 이름 + .m4a

3. [알림]
   - "MerryNote 전송 완료 ✅"
```

---

## 3단계: 사용법

### 회의 중 직접 녹음
1. 아이폰에서 단축어 A 실행
2. 녹음 시작 → 회의 종료 후 정지
3. Mac이 자동으로 감지 → 전사 → 회의록 생성

### 음성 메모 앱으로 녹음한 경우
1. 음성 메모 앱에서 녹음 파일 선택
2. 공유 → 단축어 B 선택
3. 제목 입력 후 완료

---

## 4단계: Raycast에 추가 (선택)

```bash
# Raycast에서 바로 감시 시작/종료
# raycast-scripts/에 아래 스크립트 추가됨
```

---

## 확인: inbox 폴더 위치

```
~/Library/Mobile Documents/com~apple~CloudDocs/merrynote-inbox/
```

Finder에서 보려면: iCloud Drive > merrynote-inbox

---

## 문제 해결

| 증상 | 해결 |
|------|------|
| Mac에서 파일을 못 찾음 | iCloud 동기화 대기 (최대 1분) |
| 전사가 비어있음 | 시스템 설정 > 개인정보 > 음성 인식 허용 |
| fswatch 없음 | `brew install fswatch` |
| 회의록 생성 안됨 | `which claude`로 Claude CLI 확인 |
