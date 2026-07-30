/**
 * db.js
 * ------------------------------------------------------------------
 * 이 브라우저 안에서 동작하는 아주 단순한 "데이터베이스"입니다.
 * 실제 서버 DB는 아니고 localStorage를 테이블처럼 씁니다 — 하지만
 * 화면에서 추가/수정/삭제한 내용이 새로고침해도, 브라우저를 껐다 켜도
 * 계속 남아있다는 점에서 데이터베이스처럼 동작합니다.
 *
 * 레코드(device) 필드
 * --------------------
 * id             : 고유 id (문자열)
 * name           : 제품 이름
 * emoji          : 목록 아이콘
 * category       : "뷰티" | "다이어트" | "수면" | "기타"
 * targetOrgan    : brain / skin / stomach / intestine / liver / kidney
 * animationType  : "wave" | "ferment" | "receptor" | "pulse"
 * adClaim        : 광고 주장
 * realMechanism  : 실제 기전
 * sideEffects    : 한계 · 부작용
 *
 * 여러 브라우저(친구들)끼리 DB를 맞추고 싶다면 exportAll() 로 JSON을
 * 내려받아 보내고, 받은 쪽은 importMerge() 로 합치면 됩니다.
 */

const DB = (function () {
  "use strict";

  const STORE_KEY = "bam_db_devices_v1";
  const SEEDED_KEY = "bam_db_seeded_v1";

  function readRaw() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn("DB 읽기 실패", e);
      return [];
    }
  }

  function writeRaw(arr) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn("DB 쓰기 실패", e);
      return false;
    }
  }

  // 이 브라우저에서 처음 실행되는 거라면, 시드 데이터로 DB를 한 번만 채운다.
  function ensureSeeded() {
    if (localStorage.getItem(SEEDED_KEY)) return;
    writeRaw(JSON.parse(JSON.stringify(SEED_DEVICES)));
    try {
      localStorage.setItem(SEEDED_KEY, "1");
    } catch (e) {
      /* localStorage 를 못 쓰는 환경이면 그냥 넘어간다 */
    }
  }

  function slugify(name) {
    const base = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return (base || "device") + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  }

  return {
    /** 전체 목록 조회 */
    all() {
      ensureSeeded();
      return readRaw();
    },

    /** id로 하나 조회 */
    get(id) {
      return this.all().find((d) => d.id === id) || null;
    },

    /** 새 레코드 추가. id 가 없으면 자동 생성. 추가된 레코드를 반환. */
    insert(device) {
      const all = this.all();
      const record = Object.assign({}, device);
      if (!record.id || all.some((d) => d.id === record.id)) {
        record.id = slugify(record.name);
      }
      all.push(record);
      writeRaw(all);
      return record;
    },

    /** 기존 레코드 일부 필드 수정 */
    update(id, changes) {
      const all = this.all();
      const idx = all.findIndex((d) => d.id === id);
      if (idx === -1) return null;
      all[idx] = Object.assign({}, all[idx], changes, { id });
      writeRaw(all);
      return all[idx];
    },

    /** 레코드 삭제 */
    remove(id) {
      const all = this.all().filter((d) => d.id !== id);
      writeRaw(all);
    },

    /** 시드 데이터로 완전히 되돌리기 (초기화) */
    resetToSeed() {
      writeRaw(JSON.parse(JSON.stringify(SEED_DEVICES)));
      try {
        localStorage.setItem(SEEDED_KEY, "1");
      } catch (e) {
        /* noop */
      }
    },

    /** 전체 DB를 JSON으로 내려받기 위한 데이터 */
    exportAll() {
      return this.all();
    },

    /**
     * 다른 브라우저에서 내보낸 JSON 배열을 현재 DB에 합친다.
     * id 가 겹치면 새 id를 부여해 별개 레코드로 추가한다 (덮어쓰지 않음).
     * 반환값: 추가된 개수
     */
    importMerge(incomingArr) {
      if (!Array.isArray(incomingArr)) throw new Error("배열 형식이 아닙니다.");
      const all = this.all();
      const existingIds = new Set(all.map((d) => d.id));
      let added = 0;

      incomingArr.forEach((device) => {
        if (!device || !device.name || !device.adClaim || !device.realMechanism) return;
        const record = Object.assign({}, device);
        if (existingIds.has(record.id)) record.id = slugify(record.name);
        all.push(record);
        existingIds.add(record.id);
        added++;
      });

      writeRaw(all);
      return added;
    },
  };
})();
