# HubAccounts — kho tài khoản mã hoá và đồng bộ nhiều thiết bị

HubAccounts lưu dữ liệu trong trình duyệt bằng **IndexedDB** và mã hoá bằng **AES-256-GCM**. Dữ liệu `localStorage` từ bản cũ được tự động sao chép sang IndexedDB nhưng không bị xoá, nên nâng cấp không làm mất kho hiện có.

Google Drive chỉ nhận một file JSON đã mã hoá trong thư mục ẩn riêng của ứng dụng (`appDataFolder`). GitHub chỉ chứa source code; không chứa kho tài khoản, mật khẩu chính hay OAuth access token.

## Phương án chạy khuyến nghị

- Dùng **GitHub Pages** để mở cùng một địa chỉ HTTPS trên PC, iPhone và iPad.
- Dùng **Google Drive Sync** trong HubAccounts để chuyển kho mã hoá giữa các thiết bị.
- Định kỳ bấm **Backup** để chọn thư mục và tạo file `.json` mã hoá dự phòng trên Chrome/Edge. Safari/iPhone sẽ dùng cách tải xuống tương thích.
- Server Node.js cục bộ chỉ dùng để xem trước ứng dụng trên PC và lấy địa chỉ IP mạng; không cần triển khai server này lên Internet.

## A. Đưa lên GitHub và dùng online (GitHub Pages)

Thư mục này đã sẵn sàng để đưa lên GitHub: `index.html` tự chuyển sang ứng dụng, `.nojekyll` để GitHub Pages phục vụ nguyên trạng mọi file, `.github/workflows/test.yml` tự chạy kiểm thử mỗi lần cập nhật.

### Cách 1 — Tải lên bằng trình duyệt (không cần cài gì)

1. Đăng nhập GitHub → bấm **+ → New repository**.
2. Đặt tên, ví dụ `HubAccounts`. Chọn **Public** (GitHub Pages miễn phí cần repo public; repo chỉ chứa source, không có dữ liệu tài khoản). **Không** tick "Add a README". Bấm **Create repository**.
3. Ở trang repo trống, bấm liên kết **uploading an existing file**.
4. Mở thư mục này trong File Explorer, bật **View → Show → Hidden items** (để thấy `.nojekyll`, `.gitignore`, `.github`), chọn **tất cả** file và thư mục bên trong rồi kéo thả vào trang GitHub. Kéo nội dung bên trong, không kéo chính thư mục cha.
5. Đợi tải xong → bấm **Commit changes**.
6. Vào **Settings → Pages** → **Build and deployment** → Source: **Deploy from a branch** → Branch: `main`, thư mục `/ (root)` → **Save**.
7. Sau 1–2 phút, ứng dụng chạy tại: `https://TEN-CUA-BAN.github.io/HubAccounts/` (trang này tự mở `HubAccounts.html`).

Cập nhật về sau: vào repo → **Add file → Upload files**, kéo các file đã sửa vào (trùng tên sẽ được thay) → **Commit changes**. Trang online tự cập nhật sau 1–2 phút; ứng dụng tự lấy bản mới khi có mạng.

### Cách 2 — Dùng git (nếu đã cài Git)

```bash
git init
git add .
git commit -m "HubAccounts"
git branch -M main
git remote add origin https://github.com/TEN-CUA-BAN/HubAccounts.git
git push -u origin main
```

Sau đó bật GitHub Pages như bước 6 ở trên.

### Sau khi lên online

- **Dữ liệu cũ vẫn còn:** kho mã hoá nằm trong trình duyệt theo tên miền `TEN-CUA-BAN.github.io`. Nếu trước đây bạn đã dùng bản cũ trên cùng tài khoản GitHub này (kể cả repo khác tên, ví dụ `devic3-app`), mở bản mới trên **cùng trình duyệt** sẽ thấy lại kho cũ.
- **iPhone/iPad:** mở địa chỉ trên bằng Safari → **Chia sẻ → Thêm vào Màn hình chính**.
- **Đồng bộ nhiều thiết bị:** làm theo mục **B** (Google OAuth Client ID, khai báo origin `https://TEN-CUA-BAN.github.io`) và **C**.
- **Nút Kiểm tra trạng thái (Hotmail/Facebook/proxy/AI)** cần máy chủ cục bộ đang chạy trên PC (`start-desktop.bat`). Máy chủ mặc định cho phép trang `https://imin1x.github.io`; nếu tài khoản GitHub của bạn khác, chạy máy chủ với biến môi trường, ví dụ trong `cmd`: `set HUBACCOUNTS_ALLOWED_ORIGINS=https://TEN-CUA-BAN.github.io` rồi `npm start`. Trên iPhone các nút này báo "chưa xác định" là bình thường.
- **Không bao giờ** tải file backup `.json`/`.txt` của kho lên repo; `.gitignore` đã chặn các tên file backup thường gặp.

Nên thêm vào `.gitignore` nếu có lưu backup trong thư mục dự án:

```gitignore
hubaccounts-vault-*.json
devic3-vault-*.json
*.vault.json
.env
```

## B. Tạo Google OAuth Client ID

1. Mở [Google Cloud Console](https://console.cloud.google.com/) và tạo project riêng, ví dụ `HubAccounts Sync`.
2. Vào **APIs & Services → Library**, tìm **Google Drive API** và bấm **Enable**.
3. Vào **Google Auth Platform / OAuth consent screen**:
   - Gmail cá nhân thường chọn **External**.
   - Điền tên ứng dụng và email hỗ trợ.
   - Nếu ứng dụng ở trạng thái **Testing**, mở **Audience → Test users → Add users**, thêm chính xác từng tài khoản Google sẽ dùng và bấm **Save**.
4. Vào **Clients → Create client → Web application**.
5. Trong **Authorized JavaScript origins**, thêm chính xác:

   ```text
   https://TEN-CUA-BAN.github.io
   ```

   Chỉ nhập origin, không thêm tên repository hoặc `/HubAccounts.html`.
6. Nếu thử trên máy tính, thêm:

   ```text
   http://127.0.0.1:8765
   ```

7. Tạo client và sao chép **Client ID** có đuôi `.apps.googleusercontent.com`.
8. Không tạo hoặc chép **Client secret** vào HubAccounts. Ứng dụng web này không cần client secret.

HubAccounts chỉ yêu cầu scope `https://www.googleapis.com/auth/drive.appdata`. Quyền này chỉ cho ứng dụng đọc/ghi thư mục ẩn riêng của chính nó, không đọc các file Drive thông thường.

## C. Thiết bị đầu tiên

1. Mở HubAccounts từ GitHub Pages và mở kho bằng mật khẩu chính.
2. Bấm **Sao lưu / Khôi phục** trên thanh công cụ.
3. Tại **Đồng bộ nhiều thiết bị**, dán Google OAuth Client ID.
4. Bấm **Kết nối / Đồng bộ ngay**, đăng nhập đúng tài khoản Google và chấp nhận quyền.
5. HubAccounts tạo `devic3-vault-sync.json` đã mã hoá trong `appDataFolder`.
6. Trên Chrome/Edge, bấm **Backup**, chọn thư mục và cất file `.json` ở nơi an toàn. Trên Safari/iPhone, nút backup tải file xuống để lưu bằng ứng dụng Files hoặc chia sẻ sang Drive.

Trong phiên đang kết nối, mỗi thay đổi được đẩy lên Drive gần như ngay sau khi lưu. Các thiết bị khác đang mở, đã kết nối và không có biểu mẫu chưa lưu sẽ tự kiểm tra rồi cập nhật giao diện trong tối đa khoảng 5 giây. Khi đưa ứng dụng từ nền trở lại, HubAccounts cũng kiểm tra bản mới ngay. Access token Google chỉ nằm trong RAM của tab; sau khi đóng hoặc tải lại trang, bấm **Kết nối / Đồng bộ ngay** để cấp lại phiên. HubAccounts không lưu refresh token Google.

## D. iPhone hoặc iPad

1. Mở đúng URL GitHub Pages bằng Safari.
2. Chọn **Chia sẻ → Thêm vào Màn hình chính**.
3. Ở màn hình tạo kho, bấm **Khôi phục kho mã hoá từ Google Drive**.
4. Dán cùng Google OAuth Client ID, đăng nhập cùng tài khoản Google.
5. Nhập mật khẩu chính của kho sau khi tải xong.
6. Trước khi sửa trên thiết bị này, vào **Sao lưu / Khôi phục → Kết nối / Đồng bộ ngay** để lấy bản mới nhất.

Nếu Safari vẫn chặn cửa sổ đăng nhập, vào **Cài đặt iPhone → Ứng dụng → Safari → tắt Chặn cửa sổ bật lên** trong lúc kết nối, đồng thời tạm tắt content blocker cho trang GitHub Pages. Sau khi kết nối xong có thể bật lại. Google yêu cầu đăng nhập bắt đầu trực tiếp từ một lần bấm của người dùng.

### Sửa lỗi `403: access_denied`

Lỗi “ứng dụng chưa hoàn tất quy trình xác minh” trong khi app ở chế độ Testing nghĩa là Gmail đang đăng nhập chưa được cấp quyền thử nghiệm:

1. Chọn đúng Google Cloud project đã tạo OAuth Client ID đang dán trong HubAccounts.
2. Mở **Google Auth Platform → Audience**.
3. Tại **Test users**, bấm **Add users**.
4. Thêm đúng địa chỉ Gmail xuất hiện trong cửa sổ lỗi và bấm **Save**.
5. Đóng cửa sổ lỗi, đợi vài phút rồi bấm **Kết nối / Đồng bộ ngay** lại.

Nếu muốn nhiều người ngoài danh sách Test users sử dụng, cần chuyển ứng dụng sang **In production** và hoàn thành các yêu cầu xác minh mà Google hiển thị. Với ứng dụng cá nhân, giữ chế độ Testing và khai báo các tài khoản của mình thường đơn giản và an toàn hơn.

## E. Quy trình tránh xung đột

1. Mở thiết bị A → kết nối và đồng bộ.
2. Sửa dữ liệu trên A → chờ đồng bộ hoàn tất.
3. Trước khi dùng thiết bị B → kết nối và đồng bộ để nhận bản mới.
4. Tránh sửa đồng thời trên hai thiết bị đang ngoại tuyến.

Nếu cả hai bản đều thay đổi, HubAccounts không tự ghi đè mà cho chọn:

- **Dùng bản trên Google Drive**: thay kho thiết bị bằng bản Drive.
- **Giữ bản trên thiết bị**: ghi bản thiết bị lên Drive.
- **Huỷ**: không thay đổi để có thể xuất backup trước khi quyết định.

Ứng dụng không tự trộn hai kho vì có thể làm sống lại tài khoản đã xoá hoặc mất chỉnh sửa.

## F. Chế độ chạy Offline trên PC (Desktop)

Ứng dụng hỗ trợ chạy hoàn toàn Offline trên máy tính mà không cần Internet, đảm bảo tính riêng tư và bảo mật tuyệt đối cho dữ liệu:

1. **Khởi động 1-click**: Bấm đúp chạy file `start-desktop.bat` trong thư mục dự án. Trình duyệt sẽ tự động mở `http://127.0.0.1:8765/HubAccounts.html`.
2. Hoặc mở dòng lệnh và chạy: `npm start`.
3. Dữ liệu trên PC được lưu trữ mã hóa trong IndexedDB cục bộ và có thể sao lưu/nạp trực tiếp từ file `.json` mã hóa trên ổ cứng.
4. Giao diện nằm trong `hubaccounts.css`; mã nguồn được tách theo tính năng trong thư mục `js/` (xem mục **J. Cấu trúc mã nguồn**).
5. Máy chủ cục bộ chỉ nhận yêu cầu từ chính ứng dụng (`127.0.0.1`/`localhost`) và từ `https://imin1x.github.io`. Nếu dùng tên miền khác, đặt biến môi trường `HUBACCOUNTS_ALLOWED_ORIGINS` (phân tách bằng dấu phẩy) trước khi chạy, ví dụ `set HUBACCOUNTS_ALLOWED_ORIGINS=https://ten-mien-cua-ban.github.io`. Khi mở `HubAccounts.html` trực tiếp bằng `file://`, các nút kiểm tra sẽ báo không kết nối được máy chủ — hãy mở qua `http://127.0.0.1:8765`.

## F2. Tab AI — Quản lý tài khoản ChatGPT, Claude, Gemini, Grok

Tab **AI** chuyên dụng cho các tài khoản trí tuệ nhân tạo (OpenAI ChatGPT, Anthropic Claude, Google Gemini, xAI Grok, Midjourney, v.v.):

- **Định dạng nhập tự động (Auto Import)**:
  `Tài khoản|Mật khẩu|2FA|Email liên kết|Pass Email|API Key / Token|Cookie|Ghi chú / Model`
- Tự động sinh mã xác thực 2 bước (TOTP 6 số) thời gian thực với nút sao chép tức thì.
- Lưu trữ an toàn API Key (`sk-...`), Session Token và Cookie.
- Bộ lọc trạng thái (Hoạt động / Không hoạt động / Chưa xác định) và phân nhóm theo thư mục (Folder) theo từng nền tảng AI.

## H. Tab Log

Tab **Log** trong thanh nền tảng ghi lại các hoạt động chính như mở/khoá kho, thêm/sửa/xoá tài khoản, nhập/xuất, thư mục, ghi chú, kiểm tra trạng thái và đồng bộ Google Drive. Các lỗi JavaScript không được xử lý cũng được ghi với mức **Lỗi** và vị trí file/dòng khi trình duyệt cung cấp.

- Log được mã hoá bằng cùng khoá AES của kho đang mở.
- Log chỉ lưu cục bộ trên từng thiết bị và không đẩy lên Google Drive, tránh tạo vòng lặp đồng bộ.
- Giữ tối đa 500 sự kiện; các lỗi giống nhau liên tiếp được gộp lại.
- Không ghi UID, email, mật khẩu, cookie, token, mã OTP hoặc secret 2FA.
- Có tìm kiếm, lọc Thông tin/Cảnh báo/Lỗi và nút xoá toàn bộ log cục bộ.

## I. Tính năng mới nâng cấp

### 1. Kiểm tra trạng thái Facebook / Hotmail / Gmail
- Nút **[Kiểm tra]** trên thẻ tài khoản; không cần nhập mật khẩu hay gửi form.
- **Hotmail:** hỏi trực tiếp Microsoft qua máy chủ cục bộ → `Hoạt động` (xanh) hoặc `Không hoạt động` (đỏ). Cần chạy `start-desktop.bat` trên PC.
- **Facebook:** qua máy chủ cục bộ, hoặc dò ảnh đại diện ngay trong trình duyệt khi không có máy chủ. Lỗi mạng không bị tính là "die".
- **Gmail:** Google không cung cấp cách kiểm tra tài khoản còn sống, nên chỉ kiểm tra định dạng (sai định dạng → `Không hoạt động`).
- Khi không xác định được (mất mạng, không có máy chủ cục bộ — ví dụ trên iPhone, hoặc Gmail hợp lệ) ứng dụng **giữ nguyên trạng thái hiện tại** và báo rõ lý do, không đoán.

### 2. Live Proxy Tester & Auto IP Ping
- Nút **[Ping]** trên thẻ Proxy kiểm tra kết nối TCP socket trực tiếp đến IP:Port của proxy.
- Đo độ trễ (Latency `ms`) thực tế và hiển thị huy hiệu màu:
  - Xanh: < 300ms (Cực tốt)
  - Vàng: 300ms - 800ms (Bình thường)
  - Đỏ / Mất kết nối: > 800ms hoặc Timeout / Lỗi.

### 3. API Quota & Token Checker (Tab AI)
- Nút **[Check Key]** trên thẻ tài khoản AI kiểm tra trực tiếp tính hợp lệ của Token/Key đối với các nhà cung cấp phổ biến: OpenAI, Anthropic, OpenRouter, Google Gemini.
- Tự động phát hiện Key còn lượt hay bị cạn Quota / Hết hạn. Kết quả hiển thị trong thông báo và tab Log (không ghi thêm vào ô Ghi chú).
- Chỉ giá trị có dạng API key (`sk-...`, `AIza...`) mới được gửi đi kiểm tra; mật khẩu thường không bao giờ bị gửi ra ngoài.

### 4. Auto-Fill & One-Click Copy Assistant (Command Palette)
- Nhấn tổ hợp phím **`Ctrl + K`** (Windows) hoặc **`Cmd + K`** (macOS/iOS) hoặc mở từ menu Công cụ.
- Tìm kiếm tức thì tài khoản trên toàn bộ kho lưu trữ.
- Phím tắt số một chạm:
  - Phím **`1`**: Sao chép Tên tài khoản / Email / User
  - Phím **`2`**: Sao chép Mật khẩu (Password)
  - Phím **`3`**: Sao chép Mã 2FA TOTP hiện tại
  - Phím **`4`**: Sao chép Cookie
  - Phím **`5`**: Sao chép Token / API Key
- Hiện thông báo ngay sau khi sao chép; bấm `Esc` để đóng bảng. Bảng tự đóng khi kho bị khoá.

### 5. Tối ưu iPhone/iPad PWA & Mở khoá Sinh trắc học (WebAuthn)
- Hỗ trợ **Face ID** / **Touch ID** trên iPhone/iPad và **Windows Hello** trên máy tính.
- Cài đặt 1 lần từ menu Công cụ -> Mở khoá sinh trắc học.
- Khi mở lại ứng dụng, chỉ cần bấm **"Mở bằng Face ID / Touch ID"** mà không cần gõ lại mật khẩu chính.
- Khoá kho được mã hoá bằng khoá bí mật do Secure Enclave / TPM cấp **chỉ sau khi** xác thực sinh trắc học thành công (WebAuthn PRF); không lưu khoá dạng thô. Cần trình duyệt hỗ trợ PRF (Safari iOS 18+, Chrome/Edge bản mới). Thiết bị chưa hỗ trợ sẽ không cho bật và tiếp tục dùng mật khẩu chính.
- Cấu hình Face ID tạo bởi phiên bản cũ (lưu khoá dạng thô, không an toàn) sẽ tự động bị gỡ; hãy bật lại trong Công cụ.

## J. Cấu trúc mã nguồn

| File | Nội dung |
|---|---|
| `HubAccounts.html` | Khung trang và thứ tự nạp script |
| `index.html` | Trang gốc GitHub Pages, chuyển sang `HubAccounts.html` |
| `.nojekyll`, `.github/workflows/test.yml` | Cấu hình GitHub Pages và kiểm thử tự động trên GitHub |
| `hubaccounts.css` | Hệ thống giao diện (sáng/tối) |
| `js/storage.js` | IndexedDB + chuyển dữ liệu từ localStorage cũ |
| `js/i18n.js` | Chuỗi tiếng Việt / tiếng Anh |
| `js/core.js` | Nền tảng, trạng thái app, mã hoá, lưu trữ mã hoá, log, hàm dùng chung |
| `js/backup-sync.js` | Sao lưu file, đồng bộ Google Drive |
| `js/auth.js` | Tạo kho, khôi phục, sinh trắc học, mở khoá |
| `js/home-log.js` | Trang Home và Log |
| `js/vault.js` | Danh sách tài khoản, chọn nhiều để xoá |
| `js/notes.js`, `js/export.js`, `js/tools.js` | Ghi chú, xuất dữ liệu, công cụ |
| `js/status-check.js` | Kiểm tra trạng thái và gọi máy chủ cục bộ |
| `js/import-parse.js`, `js/account-modal.js` | Nhận dạng dữ liệu nhập, form tài khoản/thư mục |
| `js/shell.js` | Khung app: giao diện Sáng/Tối, tiêu đề, sidebar, khoá, đồng hồ/phiên/mạng |
| `js/totp.js`, `js/app.js` | Mã 2FA; khởi động, Ctrl+K |
| `server.js` | Máy chủ cục bộ + API kiểm tra |
| `test/` | Kiểm thử tự động: `npm test` |

Các file trong `js/` là script thường (không phải ES module) dùng chung phạm vi toàn cục và được nạp theo đúng thứ tự trong `HubAccounts.html`, nên vẫn chạy được khi mở file trực tiếp. Thêm file mới thì cập nhật cả `HubAccounts.html` và `APP_SHELL` trong `sw.js` (test sẽ báo nếu thiếu).

## Lưu ý bảo mật

Tab **Money** lưu theo định dạng `Name|STK|Pass|SĐT|Email`. Danh sách chỉ hiện
Name; bấm mở thẻ tài khoản để dùng nút Hiện/Ẩn hoặc Sao chép các trường còn lại.
Các trường Money nằm trong cùng kho dữ liệu mã hóa như những tài khoản khác.

- File `.json` đã mã hoá vẫn cần được giữ kín; dùng mật khẩu chính mạnh và riêng biệt.
- Quên mật khẩu chính đồng nghĩa không thể giải mã bản local hoặc Drive.
- `appDataFolder` không phải bản sao lưu duy nhất. Luôn giữ thêm backup thủ công.
- Không commit backup, refresh token, access token hoặc dữ liệu tài khoản lên GitHub.
- File `.txt` xuất từ "Nhập/Xuất" là văn bản thuần (không mã hoá); để sao lưu hãy dùng file `.json` mã hoá.
- Trên máy lạ, không bật **Giữ đăng nhập khi tải lại trang** và nhớ bấm **Khoá**.

## Đổi tên ứng dụng (trước đây: Devic3)

Ứng dụng đã đổi tên thành **HubAccounts**. Để không mất dữ liệu hiện có, các định danh lưu trữ nội bộ vẫn giữ tên cũ (không hiển thị trong giao diện): kho IndexedDB `devic3-vault`, các khoá `devic3:*`, `devic3-lang`, `devic3-keep-session`, `devic3-session-key`, `devic3-google-drive-sync`, `devic3_webauthn_cred`, file Drive `devic3-vault-sync.json` và dấu định dạng backup `"app": "devic3"`. Đổi các tên này sẽ làm mất kho, phiên đăng nhập và khả năng đọc backup cũ.

Bản cũ (`D3vic3.html`, repo `devic3-app`) không còn được hỗ trợ: hãy dùng địa chỉ mới của HubAccounts. Nếu trên iPhone còn biểu tượng bản cũ ở Màn hình chính, xoá nó và "Thêm vào Màn hình chính" lại từ địa chỉ mới — dữ liệu vẫn còn vì cùng tên miền `TEN-CUA-BAN.github.io`.
