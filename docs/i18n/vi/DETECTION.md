# Cách Detect hoạt động

Tài liệu kỹ thuật về **cách extension nhận diện game itch.io, phân loại free vs. paid, và trích xuất
metadata** — viết cho contributor và người dùng muốn biết chính xác phần tử DOM nào quyết định từng bước.

> English: [docs/DETECTION.md](../../DETECTION.md)

> Mọi selector dưới đây phản ánh markup của itch.io tại thời điểm viết. itch.io không cung cấp API công khai
> cho việc này nên detect dựa trên DOM, có thể cần cập nhật nếu họ đổi markup — xem [Bảo trì](#5-bảo-trì).

Detect chạy ở **hai nơi**:

| Bề mặt | Script | Kích hoạt | Kết quả |
|--------|--------|-----------|---------|
| Trang game — `creator.itch.io/slug` | [`content/detector.js`](../../../content/detector.js) | tải trang (`document_idle`) | metadata đầy đủ; auto-collect nếu bật |
| Browse / search — `itch.io/games/…` | [`content/search-detector.js`](../../../content/search-detector.js) | hover vào game cell | metadata gọn nhẹ; hover-để-add |

Cả hai script đều được inject trên mọi trang `*.itch.io` nhưng **thoát sớm khi trang không thuộc phạm vi của
mình**, nên không bao giờ chạy cùng lúc (trang game nằm trên subdomain `creator.itch.io`; lưới browse nằm
trên host trần `itch.io`).

Cả hai nhận diện game qua **URL đã chuẩn hoá** — `https://{creator}.itch.io/{slug}`, viết thường, bỏ query
string, hash và dấu `/` cuối ([`shared/utils.js`](../../../shared/utils.js) → `normalizeUrl`). URL này là
khoá định danh/khử trùng lặp với cả queue local lẫn database remote.

---

## 1. Detect trang game (`content/detector.js`)

### 1.1 Đây có phải trang game không?

`isGamePage()` chỉ chấp nhận URL `https://{creator}.itch.io/{slug}`, loại bỏ subdomain dành riêng
(`itch`, `leafo`, `static`, `img`, `hwcdn`) và slug dành riêng (`jams`, `profile`, `dashboard`, `games`,
`tools`, …), rồi xác nhận DOM trang game tồn tại:

```js
const hasTitle     = !!document.querySelector("h1.game_title, h1[itemprop='name']");
const hasInfoPanel = !!document.querySelector(".game_info_panel_widget, .info_panel_wrapper");
```

### 1.2 Free vs. paid — `detectFreeStatus()`

Đọc widget mua hàng `div.buy_row`:

| Điều kiện | Kết quả |
|-----------|---------|
| Không có `div.buy_row` | **Free** |
| `span.dollars[itemprop="price"]` khác `$0.00` | **Paid** (giữ chuỗi giá) |
| `a.buy_btn` chứa chữ `buy` | **Paid** |
| còn lại | **Free** |

```html
<div class="buy_row">
  <a class="buy_btn"><span class="dollars" itemprop="price">$4.99</span></a>
</div>
```

### 1.3 Metadata — bảng info panel

`parseInfoTable()` duyệt `div.info_panel_wrapper > table > tr`, đọc mỗi hàng thành cặp `key → value`.
Xử lý đặc biệt:

- Trường **đa giá trị** (`Genre`, `Tags`, `Platforms`, `Languages`, `Inputs`, `Made with`) → mảng text của
  các `<a>` (hoặc tách theo dấu phẩy).
- **Release date** → `abbr[title]` (ISO datetime đầy đủ) khi có.
- **Rating** → thuộc tính content của `[itemprop="ratingValue"]` / `[itemprop="ratingCount"]`.

### 1.4 Mô tả, thumbnail, developer, NSFW

| Trường | Nguồn | Dự phòng |
|--------|-------|----------|
| Mô tả | `.formatted_description` (câu đầu, ≤200 ký tự) | `meta[property="og:description"]` |
| Thumbnail | `meta[property="og:image"]` | `.screenshot_list img` |
| Developer | bảng info `Author` | `.game_author a` / `.user_link a` / creator trong URL |
| NSFW | quét keyword đa ngôn ngữ trên tags + mô tả | div `.view_game_warning` / `.mature_content_notice` |

### 1.5 Tra cứu nhanh Trường → Nguồn

| Trường | Nguồn |
|--------|-------|
| Tên | `h1.game_title` / `h1[itemprop="name"]` |
| Free/Paid | `div.buy_row` + `span.dollars[itemprop="price"]` |
| Developer | bảng info / `.game_author a` |
| Genre, Tags, Platforms, Languages, Inputs, Made with | bảng info |
| Status, Publisher, Release date, Rating, Average session | bảng info |
| Mô tả | `.formatted_description` |
| Thumbnail | `meta[og:image]` |
| NSFW | quét keyword + div cảnh báo nội dung |

---

## 2. Detect trang browse / search (`content/search-detector.js`) — mới ở v1.11

Trên lưới browse, mỗi game là một **cell** với markup ít hơn nhiều so với trang game đầy đủ. Extension parse
các cell này để bạn có thể add game free chỉ bằng cách **hover** — không cần mở từng trang.

### 2.1 Trang nào đủ điều kiện?

`isBrowsePageEligible()` yêu cầu **host trần** (`itch.io` hoặc `www.itch.io`, không phải creator subdomain)
và path segment đầu là `games`, rồi áp dụng danh sách cấm:

| | Mẫu | Lý do |
|---|-----|-------|
| ✅ Nhận | `itch.io/games` | lưới browse mặc định |
| ✅ Nhận | `itch.io/games/free/…` | bộ lọc free |
| ✅ Nhận | `itch.io/games/exclude-jam/free/…` | free, loại entry jam |
| ✅ Nhận | `itch.io/games/<tag>/…` (vd `tag-horror`) | mọi bộ lọc `/games` khác |
| 🚫 Bỏ | `itch.io/games/store` | gian hàng trả phí |
| 🚫 Bỏ | `itch.io/games/on-sale` | đang giảm giá, không free vĩnh viễn |
| 🚫 Bỏ | `itch.io/games/in-jam` | entry jam đang diễn ra |
| 🚫 Bỏ | `itch.io/games/5-dollars-or-less` (mọi `N-dollars-or-less`) | bộ lọc có giá |
| 🚫 Bỏ | `itch.io/tools`, `/game-assets`, `/soundtracks`, `/comics`, `/devlogs`, `/community` | không phải game (đã loại bởi prefix `games`) |

### 2.2 Giải phẫu một game cell

```html
<div class="game_cell" data-game_id="4493268">
  <div class="game_thumb">
    <a class="thumb_link game_link" href="https://bodinhe.itch.io/takecareofthedog">
      <img class="lazy_loaded" data-lazy_src="https://img.itch.zone/…/315x250%23c/ofBc9.png">
    </a>
  </div>
  <div class="game_cell_data">
    <div class="game_title">
      <a class="title game_link" href="https://bodinhe.itch.io/takecareofthedog">TAKE CARE OF THE DOG</a>
    </div>
    <div class="game_text" title="a very short story about DOG.">a very short story about DOG.</div>
    <div class="game_author"><a href="https://bodinhe.itch.io">bodinhe</a></div>
    <div class="game_genre">Adventure</div>
    <div class="game_platform"><span class="icon icon-windows8" title="Download for Windows"></span></div>
  </div>
</div>
```

`parseCell()` đọc, trong mỗi `.game_cell`:

| Trường | Selector (trong cell) | Ghi chú |
|--------|------------------------|---------|
| URL / định danh | `a.title.game_link[href]` → `normalizeUrl` (dự phòng `a.game_link`) | khoá định danh & dedup |
| Tên | text của `a.title.game_link` | |
| Developer | text của `.game_author a` | |
| Genre | text của `.game_genre` | một giá trị |
| Mô tả | `.game_text[title]` (hoặc text) | tagline; cắt còn 200 ký tự |
| Platforms | icon trong `.game_platform` → bảng dưới | mảng |
| Thumbnail | `.game_thumb img[data-lazy_src]` ‖ `img[src]`; GIF: `.gif_overlay[data-gif]` | |
| Trạng thái giá | `.price_tag` / `.price_value` / `.sale_tag` | xem §2.3 |

**Ánh xạ icon platform → tên:**

| Class icon | Platform |
|------------|----------|
| `.icon-windows8` | Windows |
| `.icon-tux` | Linux |
| `.icon-apple` | macOS |
| `.icon-android` | Android |
| `.web_flag` (“Play in browser”) | HTML5 |

### 2.3 Free vs. sale tạm thời vs. paid — điểm phân biệt mấu chốt

Thẻ giá bên trong `.game_title` quyết định tất cả. Có **ba** ca:

**(a) Free thật** — **không có phần tử `.price_tag` nào**. → **được add**.

```html
<div class="game_title">
  <a class="title game_link" href="https://bodinhe.itch.io/takecareofthedog">TAKE CARE OF THE DOG</a>
  <!-- không có .price_tag → FREE -->
</div>
```

**(b) Sale “-100%” tạm thời** — có `.price_tag` và `.price_value` là `$0` (kèm `.sale_tag` `-100%`). Game
**đang free nhưng sẽ trở lại tính phí**, nên được **gắn nhãn nhưng KHÔNG add** (repo companion chỉ liệt kê
game free *vĩnh viễn*).

```html
<div class="game_title">
  <a class="title game_link" href="https://redcap-games.itch.io/matilda">MATILDA</a>
  <a class="price_tag meta_tag sale" title="Pay $0 or more for this game">
    <div class="price_value">$0</div>
    <div class="sale_tag">-100%</div>
  </a>
</div>
```

**(c) Paid** — có `.price_tag` và `.price_value` lớn hơn `$0`. → **không add**.

```html
<div class="game_title">
  <a class="title game_link" href="https://rosesrot.itch.io/killer-chat-overkill-dlc">Killer Chat! Overkill DLC</a>
  <a class="price_tag meta_tag sale" title="Pay $8.99 or more for this game DLC">
    <div class="price_value">$8.99</div>
    <div class="sale_tag">-10%</div>
  </a>
</div>
```

`detectCellPrice()` trong code:

```js
const priceTag = cell.querySelector(".price_tag");
if (!priceTag) return "free";                       // (a)
const raw = cell.querySelector(".price_value")?.textContent.trim() ?? "";
const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
if (!isFinite(num) || num === 0) return "sale_temp"; // (b) — fail closed
return "paid";                                       // (c)
```

> **Fail-closed:** nếu không parse được giá, cell được coi là `sale_temp` (không add), không bao giờ coi là
> free. Thà bỏ sót một game free thật còn hơn add nhầm game tính phí.

### 2.4 Luồng hover → add

1. Con trỏ vào một `.game_cell` và **dừng ~400 ms** (debounce dwell — rê chuột lướt qua không kích hoạt gì).
2. `parseCell()` chạy. Cell không-free chỉ hiện chip trạng thái (`Paid`, `Sale -100%`) rồi dừng.
3. Cell free gửi `REQUEST_SEARCH_COLLECT` tới service worker, nơi **dedup → kiểm tra giới hạn 150 → add**,
   rồi trả về kết quả.
4. Kết quả hiện thành chip ở góc (`✓ Added`, `In database`, `Queue full`) **và** một toast ở góc dưới phải.
   Toast `Added` có kèm nút **Undo**.

NSFW trên cell browse là **best-effort**: chỉ quét keyword trên tên + tagline + genre (không có tags từ bảng
info). Ví dụ một cell có tagline `18+ Yandere` khớp keyword `18+`. Phân loại NSFW đầy đủ diễn ra khi backend
scrape lại trang.

Chỉ hoạt động khi bật **Settings → Search-page detection** (opt-in, mặc định tắt).

---

## 3. Khử trùng lặp (Dedup)

Một game là trùng nếu URL chuẩn hoá đã có trong:

1. **queue local** (`chrome.storage.local` → `queue`), hoặc
2. **database remote** — tập URL đọc từ `data_game/*.json` (qua `data_game/index.json`) và
   `scripts/temp_link.json`, cache trong `cache_ttl_minutes`.

Xem [`background/dedup-checker.js`](../../../background/dedup-checker.js) → `checkDuplicate`.

---

## 4. Hạn chế

- **Metadata từ cell browse chỉ một phần.** Cell chỉ cung cấp tên, developer, genre, tagline, platforms và
  thumbnail. Tags, rating, status, languages, release date, … là `N/A` cho đến khi backend scrape trang.
  Push format `url_only` (mặc định) là lựa chọn tự nhiên cho game add từ search — backend sẽ điền đầy đủ chi
  tiết từ URL.
- **NSFW là best-effort trên cell browse** (ít text để quét).
- **Sale -100% tạm thời cố tình bị bỏ qua** để giữ danh sách luôn free vĩnh viễn.

---

## 5. Bảo trì

Detect dựa trên DOM nên thay đổi markup của itch.io là nguyên nhân hỏng chính. Nếu detect hỏng:

- **Trang game** → sửa selector trong [`content/detector.js`](../../../content/detector.js).
- **Trang browse** → sửa selector trong [`content/search-detector.js`](../../../content/search-detector.js)
  (`parseCell`, `detectCellPrice`, `PLATFORM_ICONS`, `isBrowsePageEligible`).
- Danh sách keyword NSFW nằm ở [`shared/nsfw-keywords.js`](../../../shared/nsfw-keywords.js) và được inject
  vào cả hai content script bằng `npm run build:detector` — không sửa tay mảng đã inline.

Xem [CONTRIBUTING.md](../../../CONTRIBUTING.md) để biết checklist test và danh sách trang itch.io cần kiểm.
