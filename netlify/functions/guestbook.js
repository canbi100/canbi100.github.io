// netlify/functions/guestbook.js
// GET  /api/guestbook  — 최근 글 20개 조회
// POST /api/guestbook  — 글 저장 (서버 측 유효성 검사 포함)
//
// Supabase 키는 Netlify 환경 변수에서만 읽습니다.
// 브라우저에 키가 노출되지 않습니다.

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase 클라이언트 (service role key — RLS 우회)
// ---------------------------------------------------------------------------
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경 변수가 없습니다.');
  }

  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// 공통 응답 헬퍼
// ---------------------------------------------------------------------------
const headers = {
  'Content-Type': 'application/json',
  // 동일 출처 요청만 허용 (필요 시 특정 도메인으로 변경)
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function ok(body, status = 200) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

function fail(message, status = 400) {
  return { statusCode: status, headers, body: JSON.stringify({ ok: false, error: message }) };
}

// ---------------------------------------------------------------------------
// 유효성 검사
// ---------------------------------------------------------------------------
function validate(nickname, message) {
  if (!nickname || typeof nickname !== 'string') {
    return '별명을 입력해 주세요.';
  }
  const nick = nickname.trim();
  if (nick.length < 2 || nick.length > 12) {
    return '별명은 2~12자여야 합니다.';
  }

  if (!message || typeof message !== 'string') {
    return '메시지를 입력해 주세요.';
  }
  const msg = message.trim();
  if (msg.length < 1 || msg.length > 100) {
    return '메시지는 1~100자여야 합니다.';
  }

  return null; // 유효
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------
export async function handler(event) {
  // CORS preflight 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // ── GET: 목록 조회 ────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('guestbook')
        .select('id, nickname, message, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return ok(data ?? []);
    } catch (e) {
      console.error('[guestbook GET]', e.message);
      return fail('목록을 불러오지 못했어요.', 500);
    }
  }

  // ── POST: 글 저장 ─────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return fail('요청 형식이 올바르지 않습니다.');
    }

    const { nickname, message } = body;

    // 서버 측 유효성 검사
    const validationError = validate(nickname, message);
    if (validationError) {
      return fail(validationError, 400);
    }

    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('guestbook')
        .insert({ nickname: nickname.trim(), message: message.trim() });

      if (error) throw error;
      return ok({ ok: true }, 201);
    } catch (e) {
      console.error('[guestbook POST]', e.message);
      return fail('저장에 실패했습니다.', 500);
    }
  }

  // ── 그 외 메서드 ──────────────────────────────────────────────────────────
  return fail('허용되지 않는 메서드입니다.', 405);
}
