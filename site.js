const themes = [
  {
    id: "daughter",
    title: "不存在的女兒",
    image: "https://i.ibb.co/gM0JqJxL/image.png",
    page: "themes/bu-cun-zai-de-nu-er.html",
    titleArt: "assets/titles/daughter-title-art.png?v=2",
    tags: ["微恐", "劇情向", "演繹"],
    players: "2-6 人",
    time: "100 分鐘",
    priceRange: "$600-850 / 人",
    priceShort: "$600 起",
    note: "強烈建議 3-4 人體感最佳",
    accent: "#b6d783",
    tone: "memory",
    story: "『憶界』是一個由怨靈的回憶所構成的世界。在這裡，你可以找到靈魂生前的秘密，以及靈魂來不及交付的物品。你們將進入一段被遺落的記憶，從細節裡拼回她真正想說的話。",
    prices: [
      ["2 人", "$850 / 人"],
      ["3-4 人", "$680 / 人"],
      ["5-6 人", "$600 / 人"]
    ],
    booking: "https://strawberryescape.simplybook.asia/v2/?fbclid=IwY2xjawPp995leHRuA2FlbQIxMABicmlkETFBempRZXRpTWtOUHc5alJIc3J0YwZhcHBfaWQQMjIyMDM5MTc4ODIwMDg5MgABHlFRPTvtyxllUGT2-vTXpay5onfQ6SudkjFFa5L5QiXcq8ilnrdrckhAfKEB_aem_TVSXSe0Zv03-Odffo5MtYQ#book/category/1/service/5/count/1/"
  },
  {
    id: "hamel",
    title: "哈梅爾寺",
    image: "https://i.ibb.co/3md5y4km/AI.jpg",
    page: "themes/hamel-temple.html",
    titleArt: "assets/titles/hamel-title-art.png?v=2",
    tags: ["驚悚", "懸疑", "抉擇"],
    players: "2-4 人",
    time: "90 分鐘",
    priceRange: "$580-650 / 人",
    priceShort: "$580 起",
    note: "",
    accent: "#d8a64a",
    tone: "temple",
    story: "曾經香火鼎盛的寺廟，在五名孩子失蹤後被封印。多年後，這裡成了人口耳相傳的鬼廟，據說仍有人在附近消失。你們踏入寺內，將面對不只一個版本的真相。",
    prices: [
      ["2 人", "$650 / 人"],
      ["3-4 人", "$580 / 人"]
    ],
    booking: "https://strawberryescape.simplybook.asia/v2/?fbclid=IwY2xjawPp995leHRuA2FlbQIxMABicmlkETFBempRZXRpTWtOUHc5alJIc3J0YwZhcHBfaWQQMjIyMDM5MTc4ODIwMDg5MgABHlFRPTvtyxllUGT2-vTXpay5onfQ6SudkjFFa5L5QiXcq8ilnrdrckhAfKEB_aem_TVSXSe0Zv03-Odffo5MtYQ#book/category/1/service/7/count/1/"
  },
  {
    id: "ai",
    title: "這是 AI 做的密室",
    image: "https://i.ibb.co/KjZtMjyC/1.jpg",
    page: "themes/ai-room.html",
    titleArt: "assets/titles/ai-title.svg?v=2",
    tags: ["童話", "科技", "可愛"],
    players: "2-6 人",
    time: "90 分鐘",
    priceRange: "$500-650 / 人",
    priceShort: "$500 起",
    note: "",
    accent: "#67d5c2",
    tone: "signal",
    story: "你們已經在這間公司實習兩年，只要通過 AI 自動編輯出的考核，就能升任正式員工。每年的考題都由系統隨機產生，誰也無法提前準備。這一次，人類真的能贏過 AI 嗎？",
    prices: [
      ["2 人", "$650 / 人"],
      ["3-4 人", "$550 / 人"],
      ["5-6 人", "$500 / 人"]
    ],
    booking: "https://strawberryescape.simplybook.asia/v2/?fbclid=IwY2xjawPp995leHRuA2FlbQIxMABicmlkETFBempRZXRpTWtOUHc5alJIc3J0YwZhcHBfaWQQMjIyMDM5MTc4ODIwMDg5MgABHlFRPTvtyxllUGT2-vTXpay5onfQ6SudkjFFa5L5QiXcq8ilnrdrckhAfKEB_aem_TVSXSe0Zv03-Odffo5MtYQ#book/category/1/service/2/count/1/"
  },
  {
    id: "geppetto",
    title: "杰佩多先生",
    image: "https://i.ibb.co/wZqm0Nv0/3.jpg",
    page: "themes/geppetto.html",
    titleArt: "assets/titles/geppetto-title-art.png?v=2",
    tags: ["歡樂", "驚悚", "馬戲團", "友情遊戲"],
    players: "3-6 人",
    time: "90 分鐘",
    priceRange: "$500-580 / 人",
    priceShort: "$500 起",
    note: "",
    accent: "#d45f35",
    tone: "circus",
    story: "年輕人之間流行一種試膽遊戲，叫做尋找杰佩多先生的馬戲團。傳聞馬戲團會在凌晨十二點出沒，只要夥伴之間的友情足夠堅定，就能獲邀進場觀看表演。今晚，你們決定試試看。",
    prices: [
      ["3-4 人", "$580 / 人"],
      ["5-6 人", "$500 / 人"]
    ],
    booking: "https://strawberryescape.simplybook.asia/v2/?fbclid=IwY2xjawPp995leHRuA2FlbQIxMABicmlkETFBempRZXRpTWtOUHc5alJIc3J0YwZhcHBfaWQQMjIyMDM5MTc4ODIwMDg5MgABHlFRPTvtyxllUGT2-vTXpay5onfQ6SudkjFFa5L5QiXcq8ilnrdrckhAfKEB_aem_TVSXSe0Zv03-Odffo5MtYQ#book/category/1/service/4/count/1/"
  }
];

function tagMarkup(tags) {
  return tags.map((tag) => `<span class="tag">${tag}</span>`).join("");
}

function priceMarkup(prices) {
  return prices.map(([people, price]) => `
    <div class="price-row">
      <span>${people}</span>
      <strong>${price}</strong>
    </div>
  `).join("");
}

function assetPath(path) {
  if (!path) return "";
  const clean = path.replace(/^\.\//, "");
  return window.location.pathname.includes("/themes/") ? `../${clean}` : clean;
}

function renderThemeGrid() {
  const grid = document.getElementById("themeGrid");
  if (!grid) return;

  grid.innerHTML = themes.map((theme, index) => `
    <a class="case-ticket reveal ${theme.tone}" style="--card-accent: ${theme.accent}; --delay: ${index * 90}ms;" href="${theme.page}">
      <div class="ticket-main">
        <div class="ticket-kicker">
          <span>CASE ${String(index + 1).padStart(2, "0")}</span>
          <span>ADMIT ONE TEAM</span>
        </div>
        <h3 class="ticket-title" aria-label="${theme.title}">
          <img class="ticket-title-art" src="${assetPath(theme.titleArt)}" alt="${theme.title}">
        </h3>
        <div class="tag-list">${tagMarkup(theme.tags)}</div>
        <div class="ticket-facts">
          <span><i data-lucide="users"></i>${theme.players}</span>
          <span><i data-lucide="timer"></i>${theme.time}</span>
          <span><i data-lucide="badge-dollar-sign"></i>${theme.priceShort}</span>
        </div>
      </div>
      <figure class="ticket-poster">
        <img src="${theme.image}" alt="${theme.title}">
      </figure>
      <div class="ticket-stub" aria-hidden="true">
        <span>OPEN</span>
        <i data-lucide="arrow-up-right"></i>
      </div>
    </a>
  `).join("");
}

function renderThemeDetail() {
  const shell = document.getElementById("themeDetail");
  if (!shell || !window.THEME_ID) return;

  const theme = themes.find((item) => item.id === window.THEME_ID);
  if (!theme) {
    shell.innerHTML = `<section class="detail-empty"><h1>找不到主題</h1><a class="button primary" href="../index.html">回首頁</a></section>`;
    return;
  }

  document.title = `${theme.title} | 草咩咩遊戲工作室`;
  shell.innerHTML = `
    <section class="dossier-layout reveal ${theme.tone}" style="--card-accent: ${theme.accent};">
      <a class="back-link" href="../index.html#cases">
        <i data-lucide="arrow-left"></i>
        全部主題
      </a>
      <div class="dossier-poster">
        <span class="poster-label">CASE FILE</span>
        <img src="${theme.image}" alt="${theme.title}">
      </div>
      <article class="dossier-content">
        <p class="eyebrow">Theme Detail</p>
        <h1 class="dossier-title" aria-label="${theme.title}">
          <img class="dossier-title-art" src="${assetPath(theme.titleArt)}" alt="${theme.title}">
        </h1>
        <div class="tag-list">${tagMarkup(theme.tags)}</div>
        <p class="story">${theme.story}</p>
        ${theme.note ? `<p class="theme-note"><i data-lucide="badge-alert"></i>${theme.note}</p>` : ""}
        <div class="booking-panel">
          <div class="booking-stat">
            <i data-lucide="users"></i>
            <span>建議人數</span>
            <strong>${theme.players}</strong>
          </div>
          <div class="booking-stat">
            <i data-lucide="timer"></i>
            <span>遊戲時間</span>
            <strong>${theme.time}</strong>
          </div>
          <div class="price-list">
            ${priceMarkup(theme.prices)}
          </div>
          <p class="booking-notice">
            <i data-lucide="message-circle"></i>
            24 小時內預約請私訊
            <a href="https://www.facebook.com/strawberrytrueescape" target="_blank" rel="noreferrer">粉絲專頁</a>
          </p>
          <a class="button primary booking-button" href="../booking.html?theme=${theme.id}">
            <i data-lucide="calendar-check"></i>
            前往預約
          </a>
        </div>
      </article>
    </section>
  `;
}

function runRevealEffects() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18 });

  items.forEach((item) => observer.observe(item));
}

document.addEventListener("DOMContentLoaded", () => {
  renderThemeGrid();
  renderThemeDetail();
  runRevealEffects();
  if (window.lucide) {
    window.lucide.createIcons();
  }
});
