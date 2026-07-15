/**
 * app.js
 * ------------------------------------------------------------------
 * 인체 생리 시뮬레이터의 전체 동작을 담당합니다.
 * devices.js(SEED_DEVICES) → db.js(DB) 순으로 먼저 로드되어야 합니다.
 */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 기관 메타데이터                                                      */
  /* ------------------------------------------------------------------ */
  const ORGAN_META = {
    brain: { label: "뇌", origin: "50% 9%", desc: "신경전달물질과 수용체가 작용하는 곳. 수면·각성·인지에 관여합니다." },
    skin: { label: "피부(얼굴)", origin: "50% 11%", desc: "표피와 진피로 이뤄져 있고, 빛·화장품 성분이 처음 만나는 곳입니다." },
    liver: { label: "간", origin: "37% 29%", desc: "흡수된 성분을 가장 먼저 대사해 몸에 맞게 분해·해독하는 장기입니다." },
    stomach: { label: "위", origin: "64% 31%", desc: "먹은 것이 잘게 분해되고 일부 성분이 흡수되기 시작하는 곳입니다." },
    intestine: { label: "소장·대장", origin: "47% 41%", desc: "영양분 흡수의 대부분이 일어나고, 흡수되지 않은 것은 장내세균의 먹이가 됩니다." },
    kidney: { label: "신장", origin: "50% 34%", desc: "혈액을 걸러 대사되고 남은 성분과 노폐물을 소변으로 배출합니다." },
  };

  const ORGAN_IDS = ["brain", "skin", "liver", "stomach", "intestine", "kidney"];

  /* 실제 기전 재생용: 장기별 통과 경로 안내 문구 (기기의 targetOrgan이 아닌 "경유" 단계에서 사용) */
  const PIPELINE_CAPTION = {
    stomach: "위에서 음식물과 섞이며 위산·소화효소에 노출됩니다.",
    intestine: "소장 벽의 융모를 통해 혈관으로 흡수됩니다.",
    liver: "문맥을 거쳐 간에서 먼저 대사·해독됩니다 (1차 통과 대사).",
    kidney: "혈액이 걸러지며 남은 성분과 대사산물이 소변으로 배출됩니다.",
  };
  const PIPELINE_ORDER = ["stomach", "intestine", "liver", "kidney"];

  /* ------------------------------------------------------------------ */
  /* 상태                                                                */
  /* ------------------------------------------------------------------ */
  let currentDeviceId = null;
  let editingDeviceId = null; // null 이면 "추가" 모드, 값이 있으면 "수정" 모드
  let seqTimers = []; // 진행 중인 순서 재생(단계별 애니메이션) 타이머들

  /* ------------------------------------------------------------------ */
  /* DOM 참조                                                            */
  /* ------------------------------------------------------------------ */
  const $ = (sel) => document.querySelector(sel);
  const el = {
    deviceList: $("#device-list"),
    bodyStage: $("#body-stage"),
    detailFx: $("#detail-fx"),
    organLegend: $("#organ-legend"),
    organHint: $("#organ-hint"),
    dossierEmpty: $("#dossier-empty"),
    dossierContent: $("#dossier-content"),
    deviceTitle: $("#device-title"),
    deviceCategory: $("#device-category"),
    btnEditDevice: $("#btn-edit-device"),
    textAd: $("#text-ad"),
    textReal: $("#text-real"),
    textWarn: $("#text-warn"),
    btnAddDevice: $("#btn-add-device"),
    btnReset: $("#btn-reset"),
    modalAdd: $("#modal-add"),
    modalAddTitle: $("#modal-add-title"),
    btnSubmitAdd: $("#btn-submit-add"),
    formAdd: $("#form-add"),
    btnCancelAdd: $("#btn-cancel-add"),
    btnExport: $("#btn-export"),
    btnImport: $("#btn-import"),
    fileImport: $("#file-import"),
    btnIntro: $("#btn-intro"),
    modalIntro: $("#modal-intro"),
    btnCloseIntro: $("#btn-close-intro"),
    btnPlayAd: $("#btn-play-ad"),
    btnPlayReal: $("#btn-play-real"),
    seqPanel: $("#seq-panel"),
    seqModeBadge: $("#seq-mode-badge"),
    seqStepCount: $("#seq-step-count"),
    seqCaptionText: $("#seq-caption-text"),
  };

  /* ------------------------------------------------------------------ */
  /* 기기 목록 렌더링                                                     */
  /* ------------------------------------------------------------------ */
  function renderDeviceList() {
    const devices = DB.all();
    el.deviceList.innerHTML = "";

    devices.forEach((device) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "device-item" + (device.id === currentDeviceId ? " active" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", device.id === currentDeviceId ? "true" : "false");
      btn.dataset.id = device.id;

      btn.innerHTML =
        '<span class="emoji">' + escapeHtml(device.emoji || "🧪") + "</span>" +
        '<span class="meta"><span class="name">' + escapeHtml(device.name) + '</span>' +
        '<span class="cat">' + escapeHtml(device.category || "기타") + "</span></span>";

      btn.addEventListener("click", () => selectDevice(device.id));

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "edit";
      editBtn.title = "이 기기 수정";
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openEditModal(device.id);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "del";
      delBtn.title = "이 기기 삭제";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteDevice(device.id);
      });

      btn.appendChild(editBtn);
      btn.appendChild(delBtn);
      li.appendChild(btn);
      el.deviceList.appendChild(li);
    });
  }

  function deleteDevice(id) {
    const device = DB.get(id);
    if (!device) return;
    if (!confirm('"' + device.name + '"을(를) 삭제할까요? 되돌릴 수 없어요.')) return;

    DB.remove(id);
    if (currentDeviceId === id) {
      currentDeviceId = null;
      showEmptyDossier();
      clearOrganHighlights();
      el.bodyStage.classList.remove("has-device", "zoomed");
    }
    renderDeviceList();
  }

  /* ------------------------------------------------------------------ */
  /* 기관 범례                                                            */
  /* ------------------------------------------------------------------ */
  function renderOrganLegend() {
    el.organLegend.innerHTML = "";
    Object.keys(ORGAN_META).forEach((organId) => {
      const meta = ORGAN_META[organId];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.organ = organId;
      btn.innerHTML = '<span class="dot"></span>' + escapeHtml(meta.label);
      btn.addEventListener("click", () => showOrganInfo(organId));
      el.organLegend.appendChild(btn);
    });
  }

  function showOrganInfo(organId) {
    const meta = ORGAN_META[organId];
    if (!meta) return;
    el.organHint.textContent = meta.label + " — " + meta.desc;

    if (!currentDeviceId) {
      clearOrganHighlights();
      const group = el.bodyStage.querySelector('.organ[data-organ="' + organId + '"]');
      if (group) group.classList.add("active");
      const legendBtn = el.organLegend.querySelector('button[data-organ="' + organId + '"]');
      if (legendBtn) legendBtn.classList.add("active");
    }
  }

  /* ------------------------------------------------------------------ */
  /* 기기 선택 → 좌우 분할 비교                                            */
  /* ------------------------------------------------------------------ */
  function selectDevice(id) {
    const device = DB.get(id);
    if (!device) return;

    currentDeviceId = id;
    stopSequence();
    renderDeviceList();
    showDossier(device);
    renderCompare(device);
    highlightOrgan(device.targetOrgan, "real", true);
    playFx(device.animationType || "pulse", device.targetOrgan, "real");
  }

  function showEmptyDossier() {
    el.dossierEmpty.hidden = false;
    el.dossierContent.hidden = true;
    stopSequence();
  }

  function showDossier(device) {
    el.dossierEmpty.hidden = true;
    el.dossierContent.hidden = false;
    el.deviceTitle.textContent = (device.emoji ? device.emoji + " " : "") + device.name;
    el.deviceCategory.textContent = device.category || "기타";
  }

  function renderCompare(device) {
    el.textAd.textContent = device.adClaim || "";
    el.textReal.textContent = device.realMechanism || "";
    el.textWarn.textContent = device.sideEffects || "아직 등록된 부작용 정보가 없습니다.";
  }

  /* ------------------------------------------------------------------ */
  /* 인체 도해: 하이라이트 & 줌                                            */
  /* ------------------------------------------------------------------ */
  function clearOrganHighlights() {
    el.bodyStage.querySelectorAll(".organ").forEach((g) => g.classList.remove("active", "tone-ad", "tone-warning", "tone-real"));
    el.organLegend.querySelectorAll("button").forEach((b) => b.classList.remove("active", "tone-ad", "tone-warning", "tone-real"));
  }

  function highlightOrgan(organId, type, zoom) {
    clearOrganHighlights();
    el.bodyStage.classList.add("has-device");

    const group = el.bodyStage.querySelector('.organ[data-organ="' + organId + '"]');
    const legendBtn = el.organLegend.querySelector('button[data-organ="' + organId + '"]');
    const toneClass = type === "ad" ? "tone-ad" : type === "warning" ? "tone-warning" : "";

    if (group) {
      group.classList.add("active");
      if (toneClass) group.classList.add(toneClass);
    }
    if (legendBtn) {
      legendBtn.classList.add("active");
      if (toneClass) legendBtn.classList.add(toneClass);
    }

    const meta = ORGAN_META[organId];
    if (meta) {
      el.organHint.textContent = meta.label + " — " + meta.desc;
      if (zoom) {
        document.getElementById("anatomy").style.transformOrigin = meta.origin;
        el.bodyStage.classList.add("zoomed");
      } else {
        el.bodyStage.classList.remove("zoomed");
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 상세 애니메이션 (fx)                                                  */
  /* ------------------------------------------------------------------ */
  function organFxPosition(organId) {
    const group = el.bodyStage.querySelector('.organ[data-organ="' + organId + '"]');
    const stageRect = el.bodyStage.getBoundingClientRect();
    if (!group || !stageRect.width) return { xPct: 50, yPct: 50 };
    const rect = group.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return {
      xPct: ((cx - stageRect.left) / stageRect.width) * 100,
      yPct: ((cy - stageRect.top) / stageRect.height) * 100,
    };
  }

  function playFx(animationType, organId, type) {
    el.detailFx.innerHTML = "";
    const pos = organFxPosition(organId);
    const xPct = pos.xPct;
    const yPct = pos.yPct;

    if (animationType === "wave") {
      for (let i = 0; i < 3; i++) {
        const ring = document.createElement("div");
        ring.className = "fx-ring";
        ring.style.left = xPct + "%";
        ring.style.top = yPct + "%";
        ring.style.width = "60px";
        ring.style.height = "60px";
        ring.style.marginLeft = "-30px";
        ring.style.marginTop = "-30px";
        ring.style.animationDelay = i * 0.35 + "s";
        el.detailFx.appendChild(ring);
      }
    } else if (animationType === "ferment") {
      for (let i = 0; i < 8; i++) {
        const bubble = document.createElement("div");
        bubble.className = "fx-bubble";
        bubble.style.left = xPct - 8 + Math.random() * 16 + "%";
        bubble.style.bottom = 100 - yPct + "%";
        bubble.style.animationDelay = Math.random() * 1.2 + "s";
        el.detailFx.appendChild(bubble);
      }
    } else if (animationType === "receptor") {
      const molecule = document.createElement("div");
      molecule.className = "fx-molecule";
      molecule.style.left = xPct + "%";
      molecule.style.top = yPct + "%";
      el.detailFx.appendChild(molecule);
    } else {
      const pulse = document.createElement("div");
      pulse.className = "fx-pulse";
      pulse.style.left = xPct + "%";
      pulse.style.top = yPct + "%";
      if (type === "warning") pulse.style.background = "var(--warn-red)";
      else if (type === "real") pulse.style.background = "var(--real-teal)";
      el.detailFx.appendChild(pulse);
    }

    setTimeout(() => {
      el.detailFx.innerHTML = "";
    }, 2700);
  }

  /* ------------------------------------------------------------------ */
  /* 순서대로 재생: 광고 주장 / 실제 기전을 각각 인체 도해에서 연속 재생        */
  /* ------------------------------------------------------------------ */

  /**
   * 기기의 targetOrgan을 기준으로, 몸속에서 실제로 거치는 단계를 순서대로 만듭니다.
   * - 피부(국소) 제품: 피부에서 2단계로 스며드는 과정만 보여줍니다.
   * - 그 외(경구 섭취류): 위 → 소장 → 간 → (표적 기관) → 신장 순으로 지나가며,
   *   표적 기관이 파이프라인에 포함돼 있으면 그 자리에서 기기의 실제 설명을 보여줍니다.
   */
  function buildRealSteps(device) {
    const target = device.targetOrgan;

    if (target === "skin") {
      return [
        { organ: "skin", caption: "피부 표면 각질층에 발라져 스며들기 시작합니다." },
        { organ: "skin", caption: device.realMechanism || "" },
      ];
    }

    const steps = [];
    let targetInserted = false;

    PIPELINE_ORDER.forEach((organ) => {
      if (organ === target) {
        steps.push({ organ: organ, caption: device.realMechanism || "" });
        targetInserted = true;
      } else {
        steps.push({ organ: organ, caption: PIPELINE_CAPTION[organ] });
      }
    });

    if (!targetInserted) {
      // 표적 기관이 파이프라인 밖(예: 뇌)이면, 신장(배출) 직전에 끼워 넣습니다.
      steps.splice(steps.length - 1, 0, { organ: target, caption: device.realMechanism || "" });
    }

    return steps;
  }

  function clearSeqTimers() {
    seqTimers.forEach((t) => clearTimeout(t));
    seqTimers = [];
  }

  function setSeqButtonsDisabled(disabled) {
    if (el.btnPlayAd) el.btnPlayAd.disabled = disabled;
    if (el.btnPlayReal) el.btnPlayReal.disabled = disabled;
  }

  function stopSequence() {
    clearSeqTimers();
    setSeqButtonsDisabled(false);
    if (el.seqPanel) el.seqPanel.hidden = true;
  }

  function showSeqPanel(mode) {
    el.seqPanel.hidden = false;
    el.seqPanel.classList.toggle("mode-ad", mode === "ad");
    el.seqPanel.classList.toggle("mode-real", mode === "real");
    el.seqModeBadge.textContent = mode === "ad" ? "⚡ 광고가 그리는 순간" : "◍ 몸속 실제 경로";
  }

  /** 실제 기전: 단계마다 인체 도해가 해당 기관으로 이동·확대되며 순서대로 재생됩니다. */
  function playRealSequence(device) {
    clearSeqTimers();
    setSeqButtonsDisabled(true);
    showSeqPanel("real");

    const steps = buildRealSteps(device);
    const stepDuration = 1900;

    steps.forEach((step, i) => {
      const t = setTimeout(() => {
        highlightOrgan(step.organ, "real", true);
        playFx(device.animationType || "pulse", step.organ, "real");
        const meta = ORGAN_META[step.organ];
        el.seqStepCount.textContent = "STEP " + (i + 1) + " / " + steps.length;
        el.seqCaptionText.textContent = (meta ? meta.label + " — " : "") + step.caption;
      }, i * stepDuration);
      seqTimers.push(t);
    });

    const endT = setTimeout(() => setSeqButtonsDisabled(false), steps.length * stepDuration);
    seqTimers.push(endT);
  }

  /** 광고 주장: 여러 기관이 순식간에 번쩍이는 "즉각·전신 효과"처럼 과장되게 재생됩니다. */
  function playAdSequence(device) {
    clearSeqTimers();
    setSeqButtonsDisabled(true);
    showSeqPanel("ad");
    el.seqStepCount.textContent = "INSTANT";
    el.seqCaptionText.textContent = device.adClaim || "";

    const flickerOrder = ORGAN_IDS.slice().sort(() => Math.random() - 0.5);
    const flickerGap = 130;

    flickerOrder.forEach((organ, i) => {
      const t = setTimeout(() => {
        highlightOrgan(organ, "ad", false);
        playFx("pulse", organ, "ad");
      }, i * flickerGap);
      seqTimers.push(t);
    });

    const settleDelay = flickerOrder.length * flickerGap;
    const settleT = setTimeout(() => {
      highlightOrgan(device.targetOrgan, "ad", true);
      playFx(device.animationType || "pulse", device.targetOrgan, "ad");
    }, settleDelay);
    seqTimers.push(settleT);

    const endT = setTimeout(() => setSeqButtonsDisabled(false), settleDelay + 1600);
    seqTimers.push(endT);
  }

  /* ------------------------------------------------------------------ */
  /* 기기 추가 / 수정 모달 (하나의 폼을 재사용)                             */
  /* ------------------------------------------------------------------ */
  function openAddModal() {
    editingDeviceId = null;
    el.formAdd.reset();
    el.modalAddTitle.textContent = "새 기기 추가";
    el.btnSubmitAdd.textContent = "추가하기";
    el.modalAdd.hidden = false;
    setTimeout(() => $("#f-name").focus(), 0);
  }

  function openEditModal(id) {
    const device = DB.get(id);
    if (!device) return;
    editingDeviceId = id;

    $("#f-name").value = device.name || "";
    $("#f-emoji").value = device.emoji || "";
    $("#f-category").value = device.category || "기타";
    $("#f-organ").value = device.targetOrgan || "skin";
    $("#f-anim").value = device.animationType || "pulse";
    $("#f-ad").value = device.adClaim || "";
    $("#f-real").value = device.realMechanism || "";
    $("#f-warn").value = device.sideEffects || "";

    el.modalAddTitle.textContent = "기기 수정";
    el.btnSubmitAdd.textContent = "저장하기";
    el.modalAdd.hidden = false;
    setTimeout(() => $("#f-name").focus(), 0);
  }

  function closeAddModal() {
    el.modalAdd.hidden = true;
    editingDeviceId = null;
  }

  function handleAddSubmit(ev) {
    ev.preventDefault();
    const fields = {
      name: $("#f-name").value.trim(),
      emoji: $("#f-emoji").value.trim() || "🧪",
      category: $("#f-category").value,
      targetOrgan: $("#f-organ").value,
      animationType: $("#f-anim").value,
      adClaim: $("#f-ad").value.trim(),
      realMechanism: $("#f-real").value.trim(),
      sideEffects: $("#f-warn").value.trim(),
    };
    if (!fields.name || !fields.adClaim || !fields.realMechanism) return;

    if (editingDeviceId) {
      DB.update(editingDeviceId, fields);
      const updatedId = editingDeviceId;
      closeAddModal();
      renderDeviceList();
      if (currentDeviceId === updatedId) selectDevice(updatedId); // 화면에 즉시 반영
    } else {
      const created = DB.insert(fields);
      closeAddModal();
      renderDeviceList();
      selectDevice(created.id);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 초기화                                                               */
  /* ------------------------------------------------------------------ */
  function handleReset() {
    if (!confirm("추가·수정·삭제한 내용을 모두 지우고 처음 3개 기기로 되돌릴까요?")) return;
    DB.resetToSeed();
    currentDeviceId = null;
    stopSequence();
    showEmptyDossier();
    clearOrganHighlights();
    el.bodyStage.classList.remove("has-device", "zoomed");
    renderDeviceList();
  }

  /* ------------------------------------------------------------------ */
  /* 내보내기 / 불러오기                                                   */
  /* ------------------------------------------------------------------ */
  function exportAllDevices() {
    const all = DB.exportAll();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "인체시뮬레이터-기기목록.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importDevicesFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result));
        const added = DB.importMerge(incoming);
        renderDeviceList();
        alert(added + "개의 기기를 불러왔어요.");
      } catch (e) {
        alert("파일을 읽는 중 문제가 발생했어요. 이 시뮬레이터에서 내보낸 JSON 파일인지 확인해주세요.");
        console.warn(e);
      }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ */
  /* 유틸                                                                */
  /* ------------------------------------------------------------------ */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  /* ------------------------------------------------------------------ */
  /* 이벤트 바인딩                                                        */
  /* ------------------------------------------------------------------ */
  function bindEvents() {
    el.bodyStage.querySelectorAll(".organ").forEach((group) => {
      group.addEventListener("click", () => showOrganInfo(group.dataset.organ));
    });

    el.btnAddDevice.addEventListener("click", openAddModal);
    el.btnEditDevice.addEventListener("click", () => {
      if (currentDeviceId) openEditModal(currentDeviceId);
    });
    el.btnCancelAdd.addEventListener("click", closeAddModal);
    el.formAdd.addEventListener("submit", handleAddSubmit);
    el.modalAdd.addEventListener("click", (ev) => {
      if (ev.target === el.modalAdd) closeAddModal();
    });

    el.btnPlayAd.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const device = DB.get(currentDeviceId);
      if (device) playAdSequence(device);
    });
    el.btnPlayReal.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const device = DB.get(currentDeviceId);
      if (device) playRealSequence(device);
    });

    el.btnReset.addEventListener("click", handleReset);

    el.btnExport.addEventListener("click", exportAllDevices);
    el.btnImport.addEventListener("click", () => el.fileImport.click());
    el.fileImport.addEventListener("change", () => {
      const file = el.fileImport.files && el.fileImport.files[0];
      if (file) importDevicesFromFile(file);
      el.fileImport.value = "";
    });

    el.btnIntro.addEventListener("click", () => (el.modalIntro.hidden = false));
    el.btnCloseIntro.addEventListener("click", () => (el.modalIntro.hidden = true));
    el.modalIntro.addEventListener("click", (ev) => {
      if (ev.target === el.modalIntro) el.modalIntro.hidden = true;
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (!el.modalAdd.hidden) closeAddModal();
      if (!el.modalIntro.hidden) el.modalIntro.hidden = true;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 초기화                                                               */
  /* ------------------------------------------------------------------ */
  function init() {
    renderOrganLegend();
    renderDeviceList();
    bindEvents();

    if (!localStorage.getItem("bam_introSeen")) {
      el.modalIntro.hidden = false;
      try {
        localStorage.setItem("bam_introSeen", "1");
      } catch (e) {
        /* noop */
      }
    }
  }

  init();
})();
