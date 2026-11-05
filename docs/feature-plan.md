# 방명록 기능 명세

> 작성일: 2026-11-05  
> 상태: 명세 확정 · Netlify 배포 완료 · 방명록 미구현

---

## 0. 배포 정보

| 항목 | 값 |
|---|---|
| Netlify 프로젝트 이름 | `lucky-dieffenbachia-ba8e73` |
| Netlify URL | https://lucky-dieffenbachia-ba8e73.netlify.app |
| GitHub Pages URL | https://canbi100.github.io/ |
| GitHub 저장소 | https://github.com/canbi100/canbi100.github.io |
| 배포 브랜치 | `main` |
| 배포 확인일 | 2026-11-05 |

---

## 1. 목표

홈페이지 방문자가 별명과 한 줄 메시지를 남길 수 있는 방명록을 추가한다.  
저장된 글은 어떤 기기에서 접속해도 같은 내용이 보이고, 재배포 후에도 유지된다.

---

## 2. 아키텍처

```
브라우저 (index.html)
    │  fetch API (JSON)
    ▼
Netlify Functions  ←  환경 변수에서 Supabase 키 읽음
    │  supabase-js (service role key)
    ▼
Supabase (PostgreSQL)
    └─ guestbook 테이블  ← RLS ON, 직접 외부 접근 차단
```

- 브라우저는 Supabase에 직접 연결하지 않는다.
- Supabase 키(URL, service role key)는 Netlify 환경 변수에만 저장하고 서버 함수만 읽는다.
- 브라우저에는 Supabase 관련 키가 노출되지 않는다.

---

## 3. 배포 구성

| 항목 | 내용 |
|---|---|
| 정적 파일 호스팅 | Netlify |
| 서버 함수 | Netlify Functions (Node.js) |
| DB | Supabase (PostgreSQL) |
| 기존 GitHub Pages | **그대로 유지** (`canbi100.github.io`) |
| Netlify 도메인 | 별도 발급 (예: `canbi100.netlify.app`) |

GitHub Pages와 Netlify는 동일한 저장소를 각자 배포한다.  
GitHub Pages는 정적 소개 페이지 원본을 그대로 유지하고, Netlify 쪽에서 방명록 기능이 작동한다.

---

## 4. Supabase 테이블 설계

### 테이블명: `guestbook`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` | 자동 생성 |
| `nickname` | `text` | NOT NULL, CHECK (2~12자) | 방문자 별명 |
| `message` | `text` | NOT NULL, CHECK (1~100자) | 한 줄 메시지 |
| `created_at` | `timestamptz` | NOT NULL, `now()` | 서버 저장 시각 |

### CHECK 제약 (SQL)

```sql
CREATE TABLE guestbook (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname   text        NOT NULL,
  message    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nickname_length CHECK (char_length(nickname) BETWEEN 2 AND 12),
  CONSTRAINT message_length  CHECK (char_length(message)  BETWEEN 1 AND 100)
);
```

### RLS 설정

```sql
-- RLS 활성화
ALTER TABLE guestbook ENABLE ROW LEVEL SECURITY;

-- 외부에서 어떤 조작도 허용하지 않음 (정책 없음 = 전부 차단)
-- 서버 함수는 service role key를 사용하므로 RLS를 우회해 접근 가능
```

RLS를 켜고 정책을 하나도 만들지 않으면 anon key로 접근하는 브라우저는 읽기·쓰기 모두 차단된다.  
service role key를 가진 Netlify Functions만 데이터에 접근할 수 있다.

---

## 5. Netlify Functions 명세

### 5-1. POST `/api/guestbook` — 글 저장

**요청**
```json
{ "nickname": "별명", "message": "메시지" }
```

**서버 검사 (서버 함수 내부)**

| 항목 | 규칙 | 실패 시 |
|---|---|---|
| nickname 존재 | 필수 | 400 반환 |
| nickname 길이 | 2자 이상 12자 이하 | 400 반환 |
| message 존재 | 필수 | 400 반환 |
| message 길이 | 1자 이상 100자 이하 | 400 반환 |

**성공 응답** `201 Created`
```json
{ "ok": true }
```

**실패 응답** `400 Bad Request`
```json
{ "ok": false, "error": "nickname은 2~12자여야 합니다." }
```

**Supabase 저장 실패** `500 Internal Server Error`
```json
{ "ok": false, "error": "저장에 실패했습니다." }
```

---

### 5-2. GET `/api/guestbook` — 목록 조회

**응답** `200 OK`
```json
[
  {
    "id": "uuid",
    "nickname": "별명",
    "message": "메시지",
    "created_at": "2026-11-05T09:30:00Z"
  }
]
```

- `created_at` 기준 내림차순, 최대 20개 반환
- 조회 실패 시 `500`과 빈 배열 반환

---

## 6. 화면 명세 (index.html 추가 섹션)

### 위치

기존 `#contact` 섹션 바로 위에 `#guestbook` 섹션 추가.  
기존 섹션과 스타일을 통일한다 (동일한 CSS 변수 사용).

### 구성 요소

| 요소 | 설명 |
|---|---|
| 별명 입력란 | `<input type="text">`, placeholder "별명 (2~12자)" |
| 메시지 입력란 | `<input type="text">`, placeholder "한 줄 메시지 (최대 100자)" |
| 남기기 버튼 | 클릭 시 POST `/api/guestbook` 호출 |
| 글 목록 | GET `/api/guestbook` 결과를 카드 형태로 표시 |

### 동작 흐름

```
1. 페이지 로드 → GET /api/guestbook → 목록 표시
2. 입력 후 버튼 클릭
   ├─ 클라이언트 검사 실패 → 인라인 경고 문구, 요청 안 보냄
   └─ 검사 통과 → POST /api/guestbook
       ├─ 성공 (201) → 입력란 초기화 → 목록 재조회
       └─ 실패 (400/500) → 에러 메시지 표시, 입력 유지
```

### 성공·실패 메시지

| 상황 | 메시지 |
|---|---|
| nickname 길이 오류 | "별명은 2~12자여야 해요." |
| message 길이 오류 | "메시지는 1~100자여야 해요." |
| 저장 실패 | "저장에 실패했어요. 잠시 후 다시 시도해 주세요." |
| 목록 불러오기 실패 | "목록을 불러오지 못했어요." |

---

## 7. 환경 변수

Netlify 대시보드 → Site configuration → Environment variables 에서 설정.  
`.env` 파일이나 소스 코드에 직접 입력하지 않는다.

| 변수명 | 설명 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (RLS 우회용) |

---

## 8. 추가 제약

- 실명, 이메일, 전화번호 등 개인정보 입력란 없음
- 관리자 로그인·삭제 기능은 MVP 범위 밖 (추후 추가 가능)
- 도배 방지(rate limit)는 MVP에서 제외, 필요 시 Netlify Functions 내부에서 추가

---

## 9. 완성 기준 (검사 방법)

| 기준 | 검사 방법 |
|---|---|
| 글 저장됨 | 내 브라우저에서 글을 남긴 뒤 새로고침해 목록에 보이는지 확인 |
| 다른 기기에서 같은 글 보임 | 친구 휴대폰에서 접속해 같은 목록이 표시되는지 확인 |
| 재배포 후에도 글 유지 | Netlify 재배포 후 접속해 기존 글이 남아있는지 확인 |
| 유효성 검사 작동 | 별명 1자 입력 후 버튼 클릭 → 에러 문구 표시, 저장 안 됨 확인 |
| 브라우저에서 직접 접근 차단 | 브라우저 콘솔에서 Supabase URL로 직접 fetch 시 데이터 반환 안 됨 확인 |
| 서버 함수 검사 | curl 또는 Postman으로 길이 초과 데이터 POST → 400 응답 확인 |

---

## 10. 파일 구조 (구현 시 추가될 파일)

```
canbi100.github.io/
├── index.html              ← 방명록 섹션 추가
├── netlify/
│   └── functions/
│       └── guestbook.js    ← GET·POST 처리 서버 함수
├── netlify.toml            ← 함수 경로 및 리다이렉트 설정
└── docs/
    └── feature-plan.md     ← 이 문서
```
