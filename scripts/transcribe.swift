#!/usr/bin/env swift

import Foundation
import Speech
import AVFoundation

// Usage: swift transcribe.swift <path-to-audio-file>

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: swift transcribe.swift <audio-file.m4a>\n", stderr)
    exit(1)
}

let audioPath = CommandLine.arguments[1]
let audioURL = URL(fileURLWithPath: (audioPath as NSString).expandingTildeInPath)

guard FileManager.default.fileExists(atPath: audioURL.path) else {
    fputs("Error: File not found: \(audioURL.path)\n", stderr)
    exit(1)
}

// ── MYSC Vocab Loader ─────────────────────────────────────────────────────
// #file은 스크립트 자신의 경로 → vocab 폴더를 상대 경로로 찾음
let scriptDir = URL(fileURLWithPath: #file).deletingLastPathComponent()
let vocabDir  = scriptDir.deletingLastPathComponent().appendingPathComponent("vocab")

func parseNamesFile(_ url: URL) -> [String] {
    guard let content = try? String(contentsOf: url, encoding: .utf8) else {
        fputs("⚠️  names.md 없음: \(url.path)\n", stderr)
        return []
    }
    var terms: [String] = []
    for line in content.components(separatedBy: "\n") {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard t.hasPrefix("|"),
              !t.hasPrefix("| 실명"),
              !t.hasPrefix("|---") else { continue }
        let cols = t.components(separatedBy: "|")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        if cols.count >= 2 {
            terms.append(cols[0]) // 실명
            terms.append(cols[1]) // 별명
        }
    }
    return terms
}

func parseGlossaryFile(_ url: URL) -> [String] {
    guard let content = try? String(contentsOf: url, encoding: .utf8) else {
        return []  // glossary.md는 선택 파일
    }
    var terms: [String] = []
    for line in content.components(separatedBy: "\n") {
        let t = line.trimmingCharacters(in: .whitespaces)
        // "- **용어**" 패턴 파싱
        if t.hasPrefix("- **"), let r1 = t.range(of: "**"),
           let r2 = t.range(of: "**", range: r1.upperBound..<t.endIndex) {
            let term = String(t[r1.upperBound..<r2.lowerBound])
            if !term.isEmpty { terms.append(term) }
        }
    }
    return terms
}

// MYSC 핵심 용어 (항상 포함)
let coreTerms: [String] = [
    "MYSC", "AX", "AXR", "임팩트투자", "소셜벤처",
    "AX팀", "AXR팀", "AX챔피언", "챔피언",
    "소셜임팩트", "임팩트투자팀", "소셜벤처팀",
    "벤처빌더", "임팩트 생태계",
]

let nameTerms    = parseNamesFile(vocabDir.appendingPathComponent("names.md"))
let glossaryTerms = parseGlossaryFile(vocabDir.appendingPathComponent("glossary.md"))

let allVocab = Array(Set(coreTerms + nameTerms + glossaryTerms)).filter { !$0.isEmpty }

fputs("📖 MYSC vocab \(allVocab.count)개 로드 (이름 \(nameTerms.count/2)명 × 2, 핵심용어 \(coreTerms.count)개, glossary \(glossaryTerms.count)개)\n", stderr)

// ── 전사 ──────────────────────────────────────────────────────────────────
let semaphore = DispatchSemaphore(value: 0)
var finalTranscript = ""
var transcriptionError: Error?

SFSpeechRecognizer.requestAuthorization { status in
    guard status == .authorized else {
        fputs("Error: Speech recognition permission denied.\n시스템 설정 > 개인정보 보호 > 음성 인식 에서 허용해주세요.\n", stderr)
        exit(1)
    }

    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ko-KR"))
                  ?? SFSpeechRecognizer()

    guard let recognizer = recognizer, recognizer.isAvailable else {
        fputs("Error: Speech recognizer not available.\n", stderr)
        exit(1)
    }

    let request = SFSpeechURLRecognitionRequest(url: audioURL)
    request.shouldReportPartialResults = false
    request.taskHint = .dictation

    // ✅ MYSC vocab → Apple 음성 인식기에 직접 주입
    // contextualStrings: 이 단어들이 나올 확률을 높여달라고 Apple에게 힌트
    request.contextualStrings = allVocab
    fputs("🎯 Apple SFSpeechRecognizer에 MYSC vocab 주입 완료\n", stderr)

    // macOS 14+ : 커스텀 언어 모델 지원 여부 안내
    if #available(macOS 14.0, *) {
        fputs("✨ macOS 14+ 감지 — SFSpeechLanguageModel 지원 가능 (현재: contextualStrings 사용 중)\n", stderr)
    }

    fputs("🎙️  전사 중... (파일: \(audioURL.lastPathComponent))\n", stderr)

    recognizer.recognitionTask(with: request) { result, error in
        if let error = error {
            transcriptionError = error
            semaphore.signal()
            return
        }
        if let result = result, result.isFinal {
            finalTranscript = result.bestTranscription.formattedString
            semaphore.signal()
        }
    }
}

semaphore.wait()

if let error = transcriptionError {
    fputs("Error: \(error.localizedDescription)\n", stderr)
    exit(1)
}

print(finalTranscript)
