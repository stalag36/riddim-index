(function () {
  /* ========================================
     1. URL パラメータ / 共通ヘルパー
     ======================================== */

  // URL パラメータ取得
  function getParam(key) {
    return new URLSearchParams(location.search).get(key) || "";
  }

  // ファイル名キー正規化
  function normalizeFilenameKey(raw) {
    if (!raw) return "";

    let s = raw.trim();
    s = s.replace(/\s+riddim\s*$/i, "");
    s = s.replace(/\([^)]*\)/g, "");
    s = s.replace(/\./g, "_");
    s = s.replace(/\s+/g, "_");
    s = s.toLowerCase();
    s = s.replace(/[^a-z0-9_]/g, "");

    return s;
  }

  // テキスト設定ヘルパー（空なら "—" を表示）
  function setText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;

    if (value === undefined || value === null) {
      el.textContent = "—";
      return;
    }

    const s = String(value).trim();
    el.textContent = s ? s : "—";
  }

  // 文言クリーンアップ
  const cleanTitle = (s) =>
    s ? s.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim() : s;

  const cleanArtist = cleanTitle;

  const cleanLabel = (s) =>
    s ? s.replace(/\(\d+\)/g, "").trim() : s;

  /* ========================================
     2. スマホ用タッチホバー（PICKUP 曲行）
     ======================================== */

  function setupTouchHoverForSongs() {
    const rows = document.querySelectorAll(".songRow");
    if (!rows.length) return;

    let activeRow = null;

    rows.forEach((row) => {
      row.addEventListener(
        "touchstart",
        (e) => {
          if (e.touches && e.touches.length > 1) return;

          if (activeRow && activeRow !== row) {
            activeRow.classList.remove("touch-hover");
          }

          row.classList.add("touch-hover");
          activeRow = row;
        },
        { passive: true }
      );
    });

    document.addEventListener(
      "touchstart",
      (e) => {
        const t = e.target.closest && e.target.closest(".songRow");
        if (!t && activeRow) {
          activeRow.classList.remove("touch-hover");
          activeRow = null;
        }
      },
      { passive: true }
    );
  }

  /* ========================================
     3. メイン処理
     ======================================== */

  async function load() {
    try {
      /* ----------------------------------------
         3-1. riddim パラメータと JSON 読み込み
         ---------------------------------------- */
      const rawRiddim = getParam("riddim");
      if (!rawRiddim) {
        console.error("riddim パラメータがありません");
        return;
      }

      const key = normalizeFilenameKey(rawRiddim);
      if (!key) {
        console.error("ファイル名キー生成不可:", rawRiddim);
        return;
      }

      const candidates = [
        `data/${key}.json`,
        `data/${key}_full.json`,
        `data/${key.replace(/__/, "._")}.json`,
      ];

      let rec = null;

      for (const url of candidates) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) continue;
          rec = await res.json();
          break;
        } catch {
          /* ここでは候補を順番に試すだけなのでエラーは握りつぶす */
        }
      }

      if (!rec) {
        console.error("JSON を読み込めませんでした:", candidates);
        return;
      }

      const tracks = Array.isArray(rec.tracks) ? rec.tracks : [];
      const firstTrack = tracks[0] || null;
      const akaArr = Array.isArray(rec.aka) ? rec.aka : [];

      const displayName =
        (rec.riddim && String(rec.riddim).trim()) ||
        (rec.name && String(rec.name).trim()) ||
        rawRiddim;

      document.title = "RIDDIM INDEX – " + displayName;
      setText("riddimTitle", displayName);

      /* ----------------------------------------
         3-2. メタ情報（レーベル / 年 / プロデューサー / AKA）
         ---------------------------------------- */

      // レーベル
      const baseLabel =
        rec.label ||
        (firstTrack && firstTrack.label) ||
        "";
      setText("label", cleanLabel(baseLabel) || "—");

      // 年
      const baseYear =
        rec.year ||
        (rec.stats && (rec.stats.min_year || rec.stats.year)) ||
        (firstTrack && firstTrack.year) ||
        "";
      setText("year", baseYear || "—");

      // プロデューサー
      let producer =
        (firstTrack && firstTrack.producer) ||
        rec.producer ||
        "";

      if (Array.isArray(producer)) {
        producer = producer.filter(Boolean).join(" & ");
      }
      producer = String(producer).replace(/&amp;/g, "&").trim();
      setText("producer", producer || "—");

      // AKA
      setText("aka", akaArr.length ? akaArr.filter(Boolean).join(" ／ ") : "—");

      /* ----------------------------------------
         3-3. PICKUP 展開
         ---------------------------------------- */

      const ul = document.getElementById("pickup");
      if (!ul) return;
      ul.innerHTML = "";

      let picks = [];

      if (Array.isArray(rec.pickup) && rec.pickup.length) {
        const pickupArr = rec.pickup;

        // pickup に artist / title が無い場合は tracks.row_index から引き当て
        if (!("artist" in pickupArr[0]) && tracks.length) {
          const map = new Map(tracks.map((t) => [t.row_index, t]));

          pickupArr.forEach((p) => {
            if (!p || typeof p.row_index !== "number") return;
            const base = map.get(p.row_index);
            if (!base) return;

            picks.push({
              ...base,
              tier: p.tier || null,
              role: p.role || null,
              row_index: p.row_index,
            });
          });
        } else {
          picks = pickupArr.slice();
        }
      }

      // original 情報があれば、まだ含まれていない場合のみ追加
      if (rec.original?.artist && rec.original?.title) {
        const orig = rec.original;
        const origKey = `${orig.artist}___${orig.title}`.toLowerCase();

        if (!picks.some((p) => `${p.artist}___${p.title}`.toLowerCase() === origKey)) {
          picks.push(orig);
        }
      }

      // PICKUP を年順にソート（年があるもの優先）
      picks.sort((a, b) => {
        const ay = Number(a.year);
        const by = Number(b.year);
        const aOk = !isNaN(ay);
        const bOk = !isNaN(by);

        if (aOk && bOk) return ay - by;
        if (aOk) return -1;
        if (bOk) return 1;
        return 0;
      });

      // PICKUP のリスト描画
      picks.forEach((p) => {
        let artist = cleanArtist(p.artist || "—");
        let title = cleanTitle(p.title || "—");
        let year = p.year ? String(p.year).trim() : "";

        const li = document.createElement("li");
        li.className = "songRow";

        // CSS 側の overflow 設定と合わせて横スクロールを補助
        li.style.overflowX = "auto";
        li.style.webkitOverflowScrolling = "touch";

        const hasValid =
          (artist && artist !== "—") || (title && title !== "—");

        const yearHTML = year
          ? `<span class="year" aria-hidden="true"
                style="
                  user-select: none;
                  -webkit-user-select: none;
                  -moz-user-select: none;
                  -ms-user-select: none;
                "> (${year})</span>`
          : "";

        if (hasValid) {
          const queryStr = `${artist} ${title}`.trim();
          const href =
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(queryStr);

          const a = document.createElement("a");
          a.className = "songLink";
          a.href = href;
          a.target = "_blank";
          a.rel = "noopener";

          a.style.whiteSpace = "nowrap";
          a.style.display = "inline-block";

          a.innerHTML =
            `<span class="dot" aria-hidden="true">・</span>` +
            `<span class="artist">${artist}</span>` +
            `<span class="sep" aria-hidden="true"> - </span>` +
            `<span class="title">${title}</span>` +
            yearHTML;

          li.appendChild(a);
        } else {
          li.innerHTML =
            `<span class="dot" aria-hidden="true">・</span>` +
            `<span class="artist">${artist}</span>` +
            `<span class="sep" aria-hidden="true"> - </span>` +
            `<span class="title">${title}</span>` +
            yearHTML;
        }

        ul.appendChild(li);
      });

      // 曲行のタッチホバーセットアップ
      setupTouchHoverForSongs();

      /* ----------------------------------------
         3-4. タイトル右側の YouTube ボタン
         ---------------------------------------- */

      const ytBtn = document.getElementById("ytRiddimBtn");
      if (ytBtn) {
        ytBtn.onclick = () => {
          const tEl = document.getElementById("riddimTitle");
          const name = tEl?.textContent?.trim() || "";
          if (!name) return;

          const q = name + " riddim";
          const url =
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(q);
          window.open(url, "_blank", "noopener");
        };
      }

      /* ----------------------------------------
         3-5. PICKUP リスト高さ調整
         ---------------------------------------- */

      function adjustPickupHeight() {
        try {
          const vh = window.innerHeight || document.documentElement.clientHeight;

          if (!document.body.classList.contains("detailPage")) return;

          const masthead = document.querySelector(".masthead");
          const footer = document.querySelector(".footerNote");
          const cards = document.querySelectorAll(".detailPage .card.container");
          if (!masthead || !footer || cards.length < 2) return;

          const riddimCard = cards[0];
          const pickupCard = cards[1];
          const pickupHead = pickupCard.querySelector(".cardHead");

          const usedTop =
            masthead.offsetTop +
            masthead.offsetHeight +
            riddimCard.offsetHeight +
            (pickupHead ? pickupHead.offsetHeight : 0);

          const usedBottom = footer.offsetHeight + 24;
          const max = Math.max(80, vh - usedTop - usedBottom);

          document.documentElement.style.setProperty(
            "--pickup-max-height",
            max + "px"
          );
        } catch (e) {
          console.error("adjustPickupHeight エラー", e);
        }
      }

      requestAnimationFrame(adjustPickupHeight);
      window.addEventListener("resize", adjustPickupHeight);
    } catch (e) {
      console.error(e);
    }
  }

  // 即時メイン処理開始
  load();
})();
