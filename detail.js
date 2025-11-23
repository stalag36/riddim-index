(function () {

  /* ------------------------------------------------------------
   *  URL パラメータ取得
   * ------------------------------------------------------------ */
  function getParam(k) {
    return new URLSearchParams(location.search).get(k) || "";
  }

  /* ------------------------------------------------------------
   *  ファイル名キー正規化
   *  - 末尾の "riddim" 削除
   *  - () 削除
   *  - "." → "_"
   *  - 空白 → "_"
   *  - 英数と "_" 以外除去
   * ------------------------------------------------------------ */
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

  /* ------------------------------------------------------------
   *  テキスト設定ヘルパー（空なら "—"）
   * ------------------------------------------------------------ */
  function setText(id, v) {
    const el = document.getElementById(id);
    if (!el) return;

    if (v === undefined || v === null) {
      el.textContent = "—";
      return;
    }

    const s = String(v).trim();
    el.textContent = s ? s : "—";
  }

  /* ------------------------------------------------------------
   *  文言クリーンアップ
   * ------------------------------------------------------------ */
  const cleanTitle   = (s) => s ? s.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim() : s;
  const cleanArtist  = cleanTitle;
  const cleanLabel   = (s) => s ? s.replace(/\(\d+\)/g, "").trim() : s;

  /* ------------------------------------------------------------
   *  メイン処理
   * ------------------------------------------------------------ */
  async function load() {
    try {
      /* ------------------------------
       *  riddim パラメータ読取
       * ------------------------------ */
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

      /* ------------------------------
       *  JSON 読み込み
       * ------------------------------ */
      const candidates = [
        `data/${key}.json`,
        `data/${key}_full.json`,
        `data/${key.replace(/__/, "._")}.json`
      ];

      let rec = null;

      for (const url of candidates) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) continue;
          rec = await res.json();
          break;
        } catch { }
      }

      if (!rec) {
        console.error("JSON が読み込めません:", candidates);
        return;
      }

      /* ------------------------------
       *  表示用メタ情報
       * ------------------------------ */
      const tracks     = Array.isArray(rec.tracks) ? rec.tracks : [];
      const firstTrack = tracks[0] || null;
      const akaArr     = Array.isArray(rec.aka) ? rec.aka : [];

      const displayName =
        (rec.riddim && String(rec.riddim).trim()) ||
        (rec.name && String(rec.name).trim()) ||
        rawRiddim;

      document.title = "RIDDIM INDEX – " + displayName;
      setText("riddimTitle", displayName);

      /* ---- label ---- */
      const baseLabel =
        rec.label ||
        (firstTrack && firstTrack.label) ||
        "";
      setText("label", cleanLabel(baseLabel) || "—");

      /* ---- year ---- */
      const baseYear =
        rec.year ||
        (rec.stats && (rec.stats.min_year || rec.stats.year)) ||
        (firstTrack && firstTrack.year) ||
        "";
      setText("year", baseYear || "—");

      /* ---- producer ---- */
      let producer =
        (firstTrack && firstTrack.producer) ||
        rec.producer ||
        "";

      if (Array.isArray(producer)) {
        producer = producer.filter(Boolean).join(" & ");
      }
      producer = String(producer).replace(/&amp;/g, "&").trim();

      setText("producer", producer || "—");

      /* ---- AKA ---- */
      setText("aka", akaArr.length ? akaArr.filter(Boolean).join(" ／ ") : "—");

      /* ------------------------------------------------------------
       *  PICKUP 展開
       * ------------------------------------------------------------ */
      const ul = document.getElementById("pickup");
      if (!ul) return;
      ul.innerHTML = "";

      let picks = [];

      // row_index式（新方式）
      if (Array.isArray(rec.pickup) && rec.pickup.length) {
        const pickupArr = rec.pickup;

        if (!("artist" in pickupArr[0]) && tracks.length) {
          const map = new Map(tracks.map(t => [t.row_index, t]));

          pickupArr.forEach(p => {
            const base = map.get(p.row_index);
            if (!base) return;

            picks.push({
              ...base,
              tier: p.tier || null,
              role: p.role || null,
              row_index: p.row_index
            });
          });
        } else {
          // 旧形式
          picks = pickupArr.slice();
        }
      }

      // original の保険挿入
      if (rec.original?.artist && rec.original?.title) {
        const orig = rec.original;
        const origKey = `${orig.artist}___${orig.title}`.toLowerCase();

        if (!picks.some(p => `${p.artist}___${p.title}`.toLowerCase() === origKey)) {
          picks.push(orig);
        }
      }

      // ソート（year 昇順）
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

      // 描画
      picks.forEach(p => {
        let artist = cleanArtist(p.artist || "—");
        let title  = cleanTitle(p.title || "—");
        let year   = p.year ? ` (${String(p.year).trim()})` : "";

        const li = document.createElement("li");
        li.className = "songRow";
        li.style.overflowX = "auto";
        li.style.webkitOverflowScrolling = "touch";

        const query = `${artist} ${title}`.trim();
        const yurl  = "https://www.youtube.com/results?search_query=" +
                      encodeURIComponent(query);

        const a = document.createElement("a");
        a.className = "songLink";
        a.href = yurl;
        a.target = "_blank";
        a.rel = "noopener";
        a.style.whiteSpace = "nowrap";
        a.style.display = "inline-block";

        a.innerHTML =
          `<span class="dot" aria-hidden="true">・</span>` +
          `<span class="artist">${artist}</span>` +
          `<span class="sep" aria-hidden="true"> - </span>` +
          `<span class="title">${title}</span>` +
          (year ? `<span class="year" aria-hidden="true">${year}</span>` : "");

        li.appendChild(a);
        ul.appendChild(li);
      });

      /* ------------------------------------------------------------
       *  タイトル右 YouTube ボタン
       * ------------------------------------------------------------ */
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

      /* ------------------------------------------------------------
       *  ピックアップ部分の高さ調整
       * ------------------------------------------------------------ */
      function adjustPickupHeight() {
        try {
          const vh = window.innerHeight || document.documentElement.clientHeight;

          if (!document.body.classList.contains("detailPage")) return;

          const masthead   = document.querySelector(".masthead");
          const footer     = document.querySelector(".footerNote");
          const cards      = document.querySelectorAll(".detailPage .card.container");
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
          console.error("adjustPickupHeight error", e);
        }
      }

      requestAnimationFrame(adjustPickupHeight);
      window.addEventListener("resize", adjustPickupHeight);

    } catch (e) {
      console.error(e);
    }
  }

  load();

})();
