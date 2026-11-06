# Kế hoạch (bản 7): "My Company", công ty ảo chạy bằng AI, chia team, có văn phòng 3D

> Bản nháp để bạn duyệt. Chưa có dòng code nào được viết.
> Bản 3 chia công ty thành các team nhiều nhân viên để không ai phải gánh hết. Bản 4 thêm gói Pro và hồ sơ dự án. Bản 5 thêm việc clone repo vào từng dự án (mục 3.7). Bản 6 chốt chuyện hạn mức: **chỉ dùng gói Pro, không dùng API** (API tốn tiền riêng, không nằm trong Pro), **dùng hết hạn mức, hết thì dừng và tự tiếp tục khi hạn mức hồi, không hỏi** (mục 4.4). Bản 7 chọn **model và skill từ GitHub cho từng vai trò** (mục 3.8).
> Ý tưởng hiển thị tham khảo từ repo `khanh020905/my-office`. Phần điều phối công việc theo team là phần mới, repo đó không có.
>
> **Tiến độ (6/11/2026): giai đoạn 0 đến 5 đã xong** (xem ghi chú ở mục 8 về những gì đã đo và chưa kiểm chứng). Giai đoạn 6 (tùy chọn) đã làm xong cả sáu đợt 6A đến 6F (đợt nào cũng có phần "chưa kiểm chứng" ghi thật), xem ghi chú ngay dưới mục "Giai đoạn 6".

---

## 1. Ý tưởng cốt lõi

```
Bạn (Chủ)
   │ giao việc lớn
   ▼
Giám đốc (1 agent)  ── chia theo team ──┬──► Team Backend ────► Trưởng nhóm ──► BE 1, BE 2
                                        ├──► Team Frontend ───► Trưởng nhóm ──► FE 1, FE 2
                                        └──► Team Chất lượng ─► Trưởng nhóm ──► QA 1, QA 2
   ▲                                                                 │
   └── tổng hợp báo cáo ◄── Trưởng nhóm kiểm bài ◄── nhân viên nộp ◄─┘
   │
   ▼
Bạn duyệt kết quả cuối
```

**Ba tầng agent, mỗi tầng chia việc một lần:**
1. **Giám đốc** chia việc lớn thành phần việc theo **team**.
2. **Trưởng nhóm** chia phần việc của team thành các việc nhỏ cho **từng nhân viên**, dựa vào tải hiện tại của họ.
3. **Nhân viên** làm một việc nhỏ tại một thời điểm rồi nộp bài.

Nhờ vậy một lệnh "làm tính năng X" thành nhiều việc nhỏ chạy song song bởi nhiều người, thay vì dồn hết cho một agent.

- **Chủ (bạn)** là người thật: viết việc cần làm, duyệt kế hoạch, duyệt kết quả cuối.
- **Văn phòng 3D** hiển thị đúng luồng này: mỗi team có khu riêng, tờ giao việc đi từ bàn bạn xuống Giám đốc, Trưởng nhóm rồi từng nhân viên.
- **Bảng kanban** đi kèm, vì khi làm việc thật bạn cần danh sách rõ ràng hơn cảnh 3D.

---

## 2. Các giả định (bạn sửa nếu sai)

| # | Giả định | Lý do |
|---|----------|-------|
| 1 | Chạy trên **Windows 11** của bạn, chỉ một người dùng là bạn | Môi trường hiện tại |
| 2 | Mỗi agent là một tiến trình **`claude -p`** (Claude Code chạy không giao diện) dùng đăng nhập **Pro** sẵn có của bạn | Không cần khóa API riêng. Tôi đã kiểm tra: máy bạn có Claude Code 2.1.308 và các cờ cần dùng (`--output-format stream-json`, `--append-system-prompt`, `--allowedTools`, `--permission-mode`, `--mcp-config`, `--resume`) đều có |
| 3 | Công ty là **công ty lập trình full-stack**: việc chính là làm tính năng, sửa lỗi, viết test trong các dự án trên máy bạn. **Công nghệ khác nhau theo từng dự án** | Bạn đã xác nhận. Vì vậy vai trò không gắn cứng với công nghệ nào, thông tin đó nằm trong hồ sơ của từng dự án (mục 3.6) |
| 4 | MVP có **3 team** (Frontend, Backend, Chất lượng), mỗi team 1 trưởng nhóm và 2 nhân viên; thêm Giám đốc là **10 agent** | Đúng cách một công ty full-stack chia việc. Hạn mức Pro được giữ bằng trần chạy đồng thời (mặc định 2) và bằng cách dựng dần từng team (mục 8). Trưởng nhóm và Giám đốc chỉ chạy theo từng đợt ngắn (chia việc, duyệt bài), nên không phải lúc nào cũng đủ 10 người chạy. DevOps và Thiết kế UI thêm ở giai đoạn sau |
| 5 | **Mặc định tối đa 2 agent chạy cùng lúc** (chỉnh được). Công ty được **dùng hết hạn mức Pro**, không chừa phần cho bạn | Bạn đã chọn dùng hết hạn mức. Nhiều agent song song làm cạn hạn mức rất nhanh; agent dư thì xếp hàng chờ. Con số 2 sẽ được đo thực tế ở giai đoạn 1 rồi chỉnh |
| 6 | Giao diện **tiếng Việt**, code và tên biến tiếng Anh | Khớp cách bạn trao đổi |
| 7 | Nhân vật low-poly vẽ bằng code | Không cần model 3D mua sẵn |
| 8 | Dữ liệu lưu cục bộ trong **SQLite** | Không cần dịch vụ ngoài, dễ sao lưu |
| 9 | Repo này là **công cụ clone vào bên trong từng dự án** của bạn, mỗi dự án một bản riêng | Bạn đã xác nhận. Mỗi dự án có cấu hình, dữ liệu và công việc riêng, không lẫn nhau (mục 3.7) |
| 10 | **Chỉ dùng gói Pro, không có chế độ API.** Hết hạn mức thì cả công ty dừng, tự tiếp tục khi hạn mức hồi, không hỏi | Bạn đã quyết định như vậy vì không muốn tốn thêm tiền. Công cụ còn chủ động ngăn việc vô tình bị tính tiền API (mục 4.4) |

---

## 3. Mô hình tổ chức

### 3.1 Khai báo team và nhân viên bằng file

Mỗi team là một thư mục. Thêm team, thêm người đều là thêm file, không sửa code.

```
teams\
├─ backend\
│   ├─ team.md          ← tên team, mục tiêu, danh sách thành viên, giới hạn
│   ├─ lead.md          ← chỉ dẫn cho Trưởng nhóm
│   └─ backend-dev.md   ← chỉ dẫn mẫu cho Lập trình viên Backend
├─ frontend\
│   ├─ team.md
│   ├─ lead.md
│   └─ frontend-dev.md
├─ quality\
│   ├─ team.md
│   ├─ lead.md
│   └─ qa.md
└─ director.md          ← chỉ dẫn cho Giám đốc
```

Ví dụ `teams/backend/team.md`:

```
---
name: Team Backend
lead: Minh
members:
  - { name: An,   role: backend-dev, strengths: [api, auth] }
  - { name: Bình, role: backend-dev, strengths: [database, migration] }
limits:
  max_active_per_member: 1     # mỗi người làm 1 việc tại một thời điểm
  max_queue_per_member: 2      # hàng chờ tối đa 2 việc
---
```

Một vai trò (`dev.md`) có thể có nhiều nhân viên; mỗi người có tên, kỹ năng và hàng đợi riêng.

### 3.2 Đội hình MVP

| Team | Chức vụ | Người | Được làm | Không được làm |
|------|---------|-------|----------|----------------|
| (Toàn công ty) | Giám đốc | 1 | Đọc code, chia việc theo team, tổng hợp báo cáo | Tự sửa code |
| Backend | Trưởng nhóm | 1 | Đọc code, chia việc cho nhân viên, duyệt bài | Tự sửa code |
| Backend | Lập trình viên Backend | 2 | Sửa code API, database, migration; chạy lệnh trong danh sách cho phép | Sửa thư mục frontend; push |
| Frontend | Trưởng nhóm | 1 | Đọc code, chia việc cho nhân viên, duyệt bài | Tự sửa code |
| Frontend | Lập trình viên Frontend | 2 | Sửa giao diện, component, gọi API; chạy lệnh trong danh sách cho phép | Sửa thư mục backend và migration; push |
| Chất lượng | Trưởng nhóm | 1 | Đọc code, chia việc test, duyệt bài | Sửa code chính |
| Chất lượng | QA | 2 | Đọc code, chạy test, viết test (unit, tích hợp, e2e) | Sửa code chính |

Quyền hạn lấy từ khai báo vai trò, gồm cả **thư mục được phép sửa** (cụ thể từng dự án lấy từ hồ sơ dự án, mục 3.6). Nên "QA không được sửa code" hay "Frontend không đụng vào migration" là luật do hệ thống áp, không dựa vào việc AI tự giữ lời.

### 3.3 Cách hệ thống đảm bảo "không ai gánh hết"

Đây là phần quan trọng nhất của bản này. Các luật do **server ép**, không chỉ nhờ AI tự giác:

| Cơ chế | Cách hoạt động |
|--------|----------------|
| **Giới hạn tải mỗi người** | Mỗi nhân viên có tối đa 1 việc đang làm và `max_queue` việc chờ. Giao quá thì server từ chối (kể cả khi bạn giao việc lẻ) và báo kèm bảng tải để Trưởng nhóm giao người khác. *(đã làm, đã kiểm thử)* |
| **Giới hạn kích thước việc** | Mỗi việc nhỏ có trần về số lượt, thời gian và lượng dùng hạn mức. Việc vượt trần bị trả về Trưởng nhóm để chia nhỏ hơn |
| **Chia theo tải thật** | Trưởng nhóm có công cụ `get_team_workload()` xem ai đang rảnh, ai đầy, rồi giao cho người phù hợp kỹ năng và ít việc nhất |
| **Chia lại khi nghẽn** | Việc nằm chờ quá lâu hoặc người làm bị kẹt thì server báo Trưởng nhóm để chuyển cho người khác |
| **Chạy song song an toàn** | Mỗi nhân viên có nhánh git / worktree riêng; việc chạm cùng file được báo trước để không giao song song |
| **Chia theo phạm vi** | Giám đốc chia theo team và module, Trưởng nhóm chia tiếp theo file hoặc nhiệm vụ, để mỗi người nhận một phần có ranh giới rõ |
| **Kiểm chéo giữa team** | Team Chất lượng kiểm bài của team Backend và Frontend, không để người làm tự chấm bài của mình |
| **Trần chạy cùng lúc** | Tối đa N agent chạy đồng thời toàn công ty (mặc định 2); phần còn lại xếp hàng |

### 3.4 Vòng đời một công việc

```
Nháp → Giám đốc lập kế hoạch → [Chủ duyệt kế hoạch]
     → Giao cho các team → Trưởng nhóm chia việc nhỏ cho từng người
     → Nhân viên làm (song song khi không phụ thuộc nhau, mỗi người một việc)
     → Nộp bài → Trưởng nhóm kiểm tra
          ├─ chưa đạt → trả về làm lại (tối đa N lần)
          └─ đạt → ghép Backend + Frontend → team Chất lượng kiểm chéo
                       ├─ lỗi → trả về team Backend hoặc Frontend tùy lỗi
                       └─ đạt → Giám đốc tổng hợp → [Chủ duyệt kết quả] → Hoàn thành
```

`[ ]` là điểm dừng bắt buộc cho người thật. Bạn bỏ bớt được ở giai đoạn sau, nhưng ở MVP cả hai đều bật.

### 3.5 Cách chia một tính năng full-stack

Việc full-stack có thứ tự phụ thuộc, nên mỗi việc nhỏ có trường `depends_on` và server chỉ mở việc khi việc phía trước xong. Ví dụ "thêm tính năng đăng nhập bằng email":

```
Bước 1  Giám đốc + Trưởng nhóm Backend chốt HỢP ĐỒNG API (đường dẫn, dữ liệu vào/ra, mã lỗi)
           │  ghi thành file dùng chung (OpenAPI hoặc kiểu TypeScript)
           ├────────────────────────────┬─────────────────────────────┐
Bước 2   Backend (song song)       Frontend (song song)          QA (song song)
         BE 1: endpoint + auth     FE 1: form đăng nhập          QA 1: viết test API
         BE 2: bảng user, migration FE 2: trạng thái, chuyển trang  QA 2: viết test e2e
           └────────────────────────────┴─────────────────────────────┘
Bước 3  Ghép Backend + Frontend, chạy toàn bộ test
Bước 4  QA kiểm chéo, báo lỗi về đúng team
Bước 5  Giám đốc tổng hợp, bạn duyệt
```

Điểm mấu chốt là **hợp đồng API chốt trước, rồi hai phía làm song song** (Frontend có thể dùng dữ liệu giả theo hợp đồng). Nhờ đó Backend và Frontend không phải chờ nhau, và không ai phải làm hết cả hai phía.

Các quy tắc đặc thù cho full-stack:
- **Migration database chỉ do Backend viết**, và mỗi lúc chỉ một người, để tránh hai bản migration đè nhau.
- **Kiểu dữ liệu dùng chung** (thư mục `shared/` hoặc file hợp đồng) chỉ sửa qua Trưởng nhóm Backend duyệt.
- **Thay đổi hợp đồng giữa chừng** phải quay lại Bước 1 và báo cả hai team, không được tự sửa một phía.

### 3.6 Hồ sơ dự án (vì công nghệ khác nhau theo từng dự án)

Vai trò chỉ nói "làm backend" hay "làm frontend". **Làm bằng công nghệ gì, chạy test thế nào** nằm trong một file hồ sơ của dự án, `local/project.md` (vị trí xem mục 3.7), ví dụ:

```
---
name: shop-online
stack: [Next.js, TypeScript, Supabase]
folders:
  backend:  [src/server, supabase]
  frontend: [src/app, src/components]
  shared:   [src/types]
commands:
  install: npm install
  test:    npm test
  lint:    npm run lint
  build:   npm run build
allowed_commands: [npm install, npm test, npm run lint, npm run build, git status, git diff, supabase migration new, supabase db lint]
conventions: |
  Dùng TypeScript chặt, tên file kebab-case, test đặt cạnh file nguồn.
---
```

Tác dụng của hồ sơ:
- Chỉ dẫn của mọi nhân viên tự ghép thêm hồ sơ này, nên **cùng một vai trò Backend** làm được cho dự án Node, Python hay Go mà không phải viết lại vai trò.
- `folders` quyết định thư mục nào thuộc team nào, từ đó áp quyền "Frontend không sửa backend" cho từng dự án.
- `allowed_commands` là danh sách lệnh nhân viên được tự chạy; lệnh ngoài danh sách phải chờ bạn duyệt.
- Công cụ nằm ngay trong dự án (mục 3.7) nên mỗi lần chạy chỉ có **một dự án**, không cần chọn dự án khi tạo việc.

**Tạo hồ sơ bằng bước khảo sát lần đầu:** khi bạn chạy lệnh `init` trong dự án, một agent đọc repo (file cấu hình, `package.json`, `pyproject.toml`, README...) rồi **đề xuất** hồ sơ. Bạn xem và sửa trước khi lưu, vì hồ sơ quyết định quyền chạy lệnh nên không để tự động chấp nhận.

### 3.7 Cách dùng: clone vào từng dự án

```
<thư mục dự án của bạn>\            ← dự án thật (git repo của bạn)
├─ src\ ...                         ← code dự án
└─ .my-company\                     ← repo này, clone vào đây (tên thư mục tùy bạn đặt)
```

Các bước cho mỗi dự án mới:
1. Trong thư mục dự án: `git clone <repo này> .my-company`
2. `cd .my-company` rồi `npm install`
3. `npm run init`: tự thêm `.my-company/` vào `.git/info/exclude` của dự án (để không bị commit nhầm mà không phải sửa `.gitignore` của bạn), khảo sát repo và đề xuất hồ sơ để bạn duyệt
4. `npm run start`: mở `http://localhost:4310`

Các quy tắc đi kèm:
- **Gốc dự án là thư mục cha** của `.my-company\`, công cụ tự nhận ra.
- **Worktree của nhân viên đặt bên ngoài dự án**, ở thư mục anh em `<tên-dự-án>-worktrees\`, để công cụ build/lint/test của dự án không quét nhầm các bản sao.
- **Cấu hình riêng của dự án nằm trong `.my-company/local/`** (không commit): hồ sơ dự án, đội hình chỉnh sửa. Mặc định nằm trong `teams/`. Nhờ vậy `git pull` để cập nhật công cụ không đè lên cấu hình của bạn.
- **Dữ liệu (SQLite, log) ở `.my-company/data/`**, mỗi dự án một bộ riêng.
- **Hạn mức Pro dùng chung giữa mọi dự án**, nên nên chạy một dự án tại một thời điểm. Nếu chạy hai, mỗi bản dùng một cổng riêng (4310, 4311...).

### 3.8 Model và skill theo từng vai trò

#### Model

**Nguyên tắc:** vai trò nào mà *quyết định sai thì cả chuỗi việc sai theo* thì dùng model mạnh hơn nhưng chạy ít lần; vai trò làm việc lặp đi lặp lại thì dùng model vừa để tiết kiệm hạn mức Pro. Không dùng model nặng nhất cho mọi người.

| Vai trò | Model | Mức suy luận (`--effort`) | Lý do |
|---------|-------|---------------------------|-------|
| Giám đốc | `opus` | high | Lập kế hoạch, chốt hợp đồng API. Chạy ít nhưng sai thì sai cả chuỗi |
| Trưởng nhóm Backend | `opus` | medium | Quyết định migration, kiến trúc, duyệt phần rủi ro cao |
| Trưởng nhóm Frontend | `sonnet` | high | Chia việc giao diện, duyệt bài |
| Trưởng nhóm Chất lượng | `sonnet` | medium | Chia việc test, duyệt bài |
| Lập trình viên Backend | `sonnet` | medium | Viết code hằng ngày, cân bằng chất lượng và hạn mức |
| Lập trình viên Frontend | `sonnet` | medium | Như trên |
| QA | `sonnet` | medium | Viết test cần hiểu code. Việc cơ học (chạy test, đọc log, tóm tắt kết quả) dùng model nhẹ nhất, `--effort low` |
| Khảo sát dự án (`init`) | `sonnet` | medium | Đọc repo, đề xuất hồ sơ để bạn duyệt |

Các quy tắc đi kèm:
- **Bí danh, không ghim phiên bản:** dùng `opus`, `sonnet`... để tự theo bản mới nhất.
- **Tự nâng bậc khi thất bại:** việc bị trả lại hai lần thì lần làm lại dùng model cao hơn một bậc (có trần và ghi nhật ký), thay vì để model vừa loay hoay mãi.
- **Tự lùi khi quá tải:** dùng cờ `--fallback-model` khi model chính quá tải hoặc không có.
- **Hệ thống tự đánh giá độ khó, bạn không phải đoán** (theo nguyên tắc của bạn: việc cần suy nghĩ thì dùng model cao, việc đơn giản dùng model thấp cho nhanh). Độ khó có ba mức: **Đơn giản** = `haiku`, suy luận thấp; **Bình thường** = theo bảng trên; **Khó** = `opus`, suy luận cao. Bảng trên chỉ là mặc định của từng vai trò. Hai lớp tự động:
  1. **Đánh giá trước khi làm:** một lần gọi `haiku` rất nhỏ (không công cụ, một lượt, vài giây, khoảng 1 nghìn token) đọc mô tả việc rồi chọn mức kèm lý do ngắn. Tiêu chí: việc cơ học hoặc rất nhỏ là Đơn giản; tính năng hoặc sửa lỗi phạm vi rõ là Bình thường; thiết kế, schema và migration, xác thực và phân quyền, bảo mật, đồng thời, lỗi khó tìm, refactor lớn, yêu cầu mơ hồ, hoặc nơi sai sót tốn kém là Khó. Lỗi hay đầu ra rác thì quay về Bình thường.
  2. **Nâng bậc khi làm chưa xong:** việc hết số lượt mà chưa xong thì tự nâng một bậc (`haiku` → `sonnet` → `opus`, tối đa một lần), làm tiếp đúng phiên cũ và được thêm 50% số lượt. Đây là lưới an toàn khi bước một đánh giá thấp.
  
  Bạn vẫn có thể ép một mức khi giao việc (khi đó hệ thống tôn trọng lựa chọn của bạn và không tự nâng bậc). Từ giai đoạn 2, Trưởng nhóm sẽ gán độ khó khi chia việc, vì họ hiểu ngữ cảnh hơn; bước đánh giá bằng `haiku` là bản thay thế khi chưa có Trưởng nhóm.
- **Không dùng `fable`** (bạn đã quyết định). Công cụ từ chối đọc file vai trò nào khai `model: fable`. "Nâng bậc khi thất bại" chỉ đi theo đường `haiku` → `sonnet` → `opus`.
- **Gói Pro có thể không cho dùng mọi model.** Giai đoạn 1 kiểm tra model nào chạy được trên tài khoản của bạn và điều chỉnh bảng cho khớp.
- Model và mức suy luận khai báo trong file vai trò, đổi được không cần sửa code.

#### Skill từ GitHub

Skill là gói chỉ dẫn và đôi khi kèm script giúp agent làm một loại việc tốt hơn. Tôi đã xem trang tổng quan các repo sau (MIT hoặc Apache 2.0, trừ ghi chú):

| Repo | Có gì |
|------|-------|
| [obra/superpowers](https://github.com/obra/superpowers) (MIT) | Quy trình làm việc: `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `writing-plans`, `brainstorming`, `requesting-code-review`... |
| [anthropics/skills](https://github.com/anthropics/skills) (nhiều skill Apache 2.0) | `frontend-design`, `webapp-testing` (kiểm thử web), `mcp-builder`... |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (MIT) | `react-best-practices`, `composition-patterns`, `web-design-guidelines`, `deploy-to-vercel` |
| [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT) | `supabase-postgres-best-practices`, `supabase` |
| [trailofbits/skills](https://github.com/trailofbits/skills) (CC-BY-SA-4.0) | Rà soát bảo mật: `insecure-defaults`, `sharp-edges`, `differential-review`, `static-analysis`, `supply-chain-risk-auditor`, `regression-hunt`... |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT) | `ui-ux-pro-max`: thiết kế giao diện (kiểu giao diện, bảng màu, cặp font, chỉ dẫn UX, checklist) |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT) | `ponytail`: bắt agent viết ít code, ưu tiên dùng lại code có sẵn |

**Gán skill cho từng vai trò** (mỗi vai trò tối đa 5 skill luôn nạp, cộng thêm tối đa 2 skill theo công nghệ, vì mô tả skill chiếm chỗ trong ngữ cảnh và ăn hạn mức):

| Vai trò | Skill luôn nạp | Skill chỉ nạp khi hồ sơ dự án khớp công nghệ |
|---------|----------------|----------------------------------------------|
| Giám đốc | (không có) | |
| Trưởng nhóm (cả 3 team) | `verification-before-completion` (superpowers) | Backend: `supabase-postgres-best-practices` nếu có PostgreSQL, `supabase` nếu dùng Supabase |
| Lập trình viên Backend | `test-driven-development`, `systematic-debugging`, `verification-before-completion` (superpowers); `ponytail` (DietrichGebert); `sharp-edges` (Trail of Bits) | `supabase-postgres-best-practices` nếu có PostgreSQL; `supabase` nếu dùng Supabase |
| Lập trình viên Frontend | `ponytail` (DietrichGebert); `test-driven-development`, `systematic-debugging`, `verification-before-completion` (superpowers) | `react-best-practices`, `composition-patterns` (Vercel) nếu dùng React hoặc Next.js |
| QA | `test-driven-development`, `systematic-debugging`, `verification-before-completion` (superpowers) | `supabase` nếu dùng Supabase (để kiểm thử đăng nhập và chính sách RLS) |

**Kết quả rà soát ở giai đoạn 3** (đã đọc toàn bộ `SKILL.md` của cả 9 skill còn lại, các file khác quét theo mẫu). Danh sách ban đầu đã đổi:
- **Đã nạp:** `react-best-practices`, `composition-patterns` (chỉ là tài liệu, bỏ `AGENTS.md`, `README.md`, `metadata.json`).
- **Đã duyệt, nằm trong thư viện nhưng KHÔNG nạp mặc định:** `ui-ux-pro-max` (dựa vào script Python gọi theo đường dẫn `${CLAUDE_PLUGIN_ROOT}/.claude/...` mà nhân viên chưa được phép chạy; script không gọi mạng, chỉ ghi file khi có `--persist`; đã bỏ thư mục `tests/`, `validate_data.py` và 4 file JSON nguồn lớn) và `webapp-testing` (`with_server.py` chạy lệnh shell tùy ý do agent đưa vào, nên cho phép nó là mở toang danh sách lệnh được phép). Muốn dùng thì tự cân nhắc rồi thêm lệnh vào `allowed_commands` và tên skill vào file vai trò (có ghi chú sẵn trong `frontend-dev.md` và `qa.md`).
- **Không cài:** `writing-plans` (bắt lưu kế hoạch ra file, gọi subagent, hỏi người dùng chọn cách làm: Giám đốc chỉ đọc và không có người để hỏi), `brainstorming` (kèm máy chủ web cục bộ `server.cjs` và tương tác với người dùng), `requesting-code-review` (dành cho người *nhờ* duyệt, gọi subagent), `web-design-guidelines` (mỗi lần dùng lại tải luật mới từ internet bằng WebFetch: nội dung thay đổi được trở thành chỉ dẫn), `differential-review` (bắt ghi file báo cáo và gọi subagent), `hunt-regressions` (cần cả bộ script khác của plugin), `insecure-defaults` (không phải skill đơn lẻ mà là plugin chạy workflow JavaScript nhiều agent).

Skill theo công nghệ chỉ nạp khi `stack` trong hồ sơ dự án khớp. Đó là lý do công nghệ khác nhau theo dự án vẫn dùng chung được đội hình này.

#### Ba skill bạn chọn thêm

**UI UX Pro Max** (MIT): dùng cho Lập trình viên Frontend, thay cho `frontend-design`, và là skill chính của team Thiết kế UI/UX về sau. Cần Python 3 (máy bạn có 3.14.4). Chỉ chép thư mục skill và script `search.py`, **không cài công cụ npm `uipro`** (nó ghi file vào thư mục dự án). Repo nói script chỉ dùng thư viện chuẩn và không gọi mạng; tôi sẽ đọc `search.py` để xác nhận trước khi dùng.

**PonyTail** (MIT): bắt agent tự hỏi "việc này có cần không, code có sẵn chưa, thư viện chuẩn có làm được không" trước khi viết, nhưng không cắt kiểm tra dữ liệu, xử lý lỗi hay bảo mật. Dùng cho hai vai trò lập trình viên. Chỉ chép `skills/ponytail/SKILL.md`, **không cài cả plugin** vì nội dung thư mục `hooks` chưa rõ. Số liệu giảm code và chi phí là do tác giả tự đo, chỉ coi là gợi ý: giai đoạn 1 sẽ đo thật xem có giảm lượng dùng hạn mức hay không. Chỉ dùng bản của DietrichGebert, không dùng các bản fork trùng tên.

**Playwright (cho QA):**
- Nền là `webapp-testing` của Anthropic, sau khi tôi đọc kỹ script (đặc biệt cách khởi động server).
- Việc chạy test chính vẫn là `npx playwright test` của chính dự án, qua danh sách lệnh được phép.
- **Không dùng** `lackeyjb/playwright-skill`: agent viết rồi chạy JavaScript không có sandbox với quyền của bạn.
- **Playwright MCP của Microsoft không dùng ở MVP:** README của nó tự nói không phải ranh giới bảo mật, và dữ liệu trang đưa vào ngữ cảnh khá nặng. Nếu sau này dùng sẽ chặn công cụ `browser_run_code_unsafe`. Bộ `@playwright/cli` đi kèm skill (theo README Microsoft là tiết kiệm token hơn) đáng thử ở giai đoạn 3.

#### Supabase

Bạn dùng Supabase nên đây là gói công nghệ chính cho Backend (kiểm tra qua trang [supabase/agent-skills](https://github.com/supabase/agent-skills), MIT):
- **Skill:** `supabase` (đăng nhập, RLS, Edge Functions, thư viện client, CLI, gỡ lỗi) và `supabase-postgres-best-practices` (hiệu năng Postgres, chỉ mục, RLS, migration). Lập trình viên Backend và Trưởng nhóm Backend nạp cả hai; QA nạp `supabase` để kiểm thử đăng nhập và chính sách RLS. Hồ sơ dự án khai `Supabase` trong `stack` thì các gói này tự được nạp.
- **Cho agent làm việc với database: ưu tiên chạy Supabase trên máy.** Supabase CLI chạy được một bản Supabase local (cần Docker, tôi chưa kiểm tra máy bạn có Docker chưa). Agent viết migration thành file trong `supabase/migrations` và thử trên bản local. **Đẩy migration lên dự án Supabase thật không nằm trong danh sách lệnh được phép**, chỉ bạn thực hiện sau khi duyệt.
- **Supabase MCP (tùy chọn, tắt mặc định, thử ở giai đoạn 2):** server MCP của Supabase ([supabase-community/supabase-mcp](https://github.com/supabase-community/supabase-mcp), Apache 2.0) cho agent đọc bảng, cấu hình và tra cứu tài liệu. Nếu bật thì: chỉ ở chế độ `read_only=true`, giới hạn một dự án bằng `project_ref`, chỉ bật nhóm công cụ cần dùng qua `features`, và chỉ nối **dự án phát triển**, không bao giờ nối dự án chạy thật. README của nó cũng khuyên đọc phần bảo mật trước khi nối. Nó cần đăng nhập Supabase; chưa rõ cách đăng nhập đó có chạy được trong `claude -p` hay không, sẽ thử thật.
- **Luật cứng cho mọi agent:** không đọc hay dùng khóa `service_role` hoặc dữ liệu thật (file `.env` vốn đã bị cấm, mục 6); mọi bảng mới phải bật RLS và có chính sách; Trưởng nhóm Backend kiểm điều này khi duyệt bài và QA viết test cho chính sách RLS.

Ví dụ khai báo trong `teams/backend/backend-dev.md`:

```
---
title: Lập trình viên Backend
model: sonnet
effort: medium
skills: [test-driven-development, systematic-debugging, verification-before-completion, ponytail, sharp-edges]
stack_skills:
  postgres: [supabase-postgres-best-practices]
  supabase: [supabase]
---
```

**Cách cài và vì sao phải cẩn thận.** Skill là chỉ dẫn mà agent làm theo, có thể kèm script chạy được trên máy bạn. Một skill xấu hoặc bị đổi nội dung sau này là đường vào cho lệnh độc hại. Nên:
1. **Chỉ lấy từ các nguồn trong bảng trên** (Anthropic, Vercel, Supabase, Trail of Bits, obra, nextlevelbuilder, DietrichGebert), không lấy skill vô danh.
2. **Không dùng lệnh tự cài hay marketplace tự cập nhật.** Tôi tải đúng một commit, **đọc `SKILL.md` và mọi script** trước khi đưa vào, rồi ghi nguồn, mã commit, ngày và giấy phép vào `skills.lock`. Bạn duyệt danh sách. Cập nhật sau này cũng qua đúng quy trình này.
3. **Chỉ chép skill được chọn, không cài cả bộ.** Ví dụ superpowers có các skill điều phối riêng (`subagent-driven-development`, `dispatching-parallel-agents`) sẽ **xung đột** với cách chia việc của công ty, nên không cài.
4. **Mỗi vai trò nạp một gói riêng** qua `--plugin-dir`, chỉ gồm skill của vai trò đó.
5. **Skill không nới quyền.** Danh sách lệnh được phép (`allowed_commands`) và thư mục được sửa của vai trò vẫn chặn mọi thứ ngoài phạm vi, kể cả khi skill bảo làm.
6. Về sau bạn thêm skill của mình bằng lệnh `skills add <đường-dẫn-github> --role <vai-trò>`: tải vào khu cách ly, hiện danh sách file và script, chờ bạn duyệt mới đưa vào.

**Lưu ý:**
- Tôi mới xem trang tổng quan các repo này, **chưa đọc từng `SKILL.md`**. Danh sách trên là đề xuất, sẽ được đọc kỹ từng skill trước khi đưa vào, và loại những skill không hợp.
- Skill của Trail of Bits dùng giấy phép CC-BY-SA-4.0: dùng cá nhân thì không sao, nhưng nếu sau này bạn chia sẻ công cụ thì phải giữ ghi nguồn và cùng giấy phép.
- Giai đoạn sau có thêm team Bảo mật (`differential-review`, `insecure-defaults`, `sharp-edges`, `static-analysis`, `supply-chain-risk-auditor` của Trail of Bits) và team DevOps (`deploy-to-vercel` nếu dùng Vercel). Team Thiết kế UI/UX dùng `ui-ux-pro-max` làm skill chính. Xem giai đoạn 6.

**Bổ sung ngày 6/11/2026: bốn nguồn do bạn chỉ định** (đã tải từng repo, đọc `SKILL.md` và mọi script, rồi cài qua `skills add` để có khóa sha256; commit khớp đúng bản đã đọc):

| Nguồn | Quyết định | Lý do |
|-------|-----------|-------|
| `pbakaus/impeccable` (Apache-2.0, commit c3bb418) | **Cài `impeccable`, bỏ thư mục `scripts/`**; nạp cho Frontend (luôn nạp) | Phần giá trị là hơn 40 bản hướng dẫn thiết kế bằng markdown (critique, audit, polish, typeset, layout, animate...). Thư mục `scripts/` có launcher **tự tải một chương trình nhị phân từ internet ở lần chạy đầu**, hook chạy sau mỗi lần sửa file và chế độ `live` chèn script vào trình duyệt; nhân viên không chạy được các lệnh đó (chỉ được chạy lệnh test của dự án) và skill có sẵn đường lui "launcher không chạy được thì đọc trực tiếp PRODUCT.md và DESIGN.md". Bỏ `scripts/` giảm từ 2,3 MB còn 0,55 MB và loại hẳn bề mặt tấn công. Vai trò Frontend được dặn không tạo `PRODUCT.md`/`DESIGN.md` ở gốc dự án. |
| `tasteskill/tasteskill` (MIT, commit 37c8c37) | **Cài `taste-skill` (tên `design-taste-frontend`) và `redesign-skill` (tên `redesign-existing-projects`)**; nạp cho Frontend **chỉ khi dự án dùng Tailwind** | Thuần markdown, đã quét không có lệnh tải, cài đặt hay chỉ dẫn ép bỏ qua người dùng. Nhưng `taste-skill` áp Tailwind, Phosphor icons, React/Next trừ khi được bảo khác, nên không nạp cho dự án không dùng Tailwind (nhận từ `package.json` qua `detectStack`, mới thêm "Tailwind CSS"). Không cài: `minimalist`, `soft`, `brutalist`, `brandkit` (phong cách riêng, để từng dự án quyết); `imagegen-*`, `image-to-code`, `stitch` (cần công cụ sinh ảnh hoặc Google Stitch mà nhân viên không có); `gpt-tasteskill` (viết cho GPT); `output-skill` (ép xuất đầy đủ không rút gọn: **đốt hạn mức Pro**, ngược với thiết kế dừng khi hết hạn mức). |
| `headroomlabs-ai/headroom` (Apache-2.0, commit 7877241) | **Cài `headroom`**; nạp cho Backend **chỉ khi stack có "LLM"** | Chỉ một tệp `SKILL.md`, dành cho ứng dụng gọi LLM (nén kết quả công cụ, log, lịch sử chat trước khi gửi). Không liên quan tới việc nhân viên của công ty này làm, chỉ hữu ích khi dự án của bạn có tính năng gọi LLM. Có hướng dẫn `pip install`, chạy proxy và `headroom wrap claude` (can thiệp vào Claude Code): nhân viên không chạy được các lệnh đó; **không bao giờ** dùng `headroom wrap claude` cho công cụ này vì nó chèn một proxy vào đường đăng nhập Pro. |
| `vercel-labs/agent-desktop` (Apache-2.0, commit b43ac4f) | **Cài `agent-desktop` và `agent-desktop-windows` vào thư viện nhưng không vai trò nào nạp mặc định** | Đó là hướng dẫn cho một chương trình dòng lệnh bên ngoài điều khiển giao diện máy tính thật (nhấp, gõ phím, đọc cửa sổ của **mọi** ứng dụng đang mở), phải cài riêng và nhân viên không được phép chạy. Chỉ hợp khi dự án là ứng dụng desktop: cài chương trình, cho phép lệnh trong `allowed_commands`, rồi thêm tên skill vào vai trò QA (đã ghi chú trong `teams/quality/qa.md`). Không cài `jev-desktop`, `agent-desktop-ffi`, `agent-desktop-linux`, `agent-desktop-macos`, `technical-writer` (nội bộ của repo). |

Có bài kiểm thử cho việc gán này (`tests/teams-skills.test.mjs`): đúng skill nạp theo stack, `impeccable` không còn `scripts/`, `agent-desktop` không vai trò nào nạp mặc định, toàn bộ thư viện còn nguyên vẹn so với `skills.lock`.

---

## 4. Kiến trúc kỹ thuật

```
Trình duyệt (Next.js + three.js)
   │  tạo việc, duyệt, xem 3D, bảng việc, tải từng team   ▲ SSE: sự kiện trực tiếp
   ▼                                                      │
Server điều phối (Node)  ──────────────────────────────────┘
   ├─ Bộ máy công việc: trạng thái, giao việc, hàng đợi từng người
   ├─ Bộ cân tải: giới hạn mỗi người, trần chạy đồng thời, chia lại
   ├─ Bộ chạy agent: mỗi nhân viên là một tiến trình `claude -p`
   │     (chỉ dẫn vai trò + hồ sơ dự án + công cụ + quyền + thư mục làm việc riêng)
   ├─ MCP server cục bộ: cấp công cụ giao việc/nộp bài cho agent (mục 4.1)
   ├─ Hồ sơ dự án (`local/project.md`): stack, thư mục từng team, lệnh được phép (mục 3.6)
   ├─ SQLite: team, nhân viên, việc, hàng đợi, tin nhắn, báo cáo, nhật ký, lượng dùng
   └─ Bộ kiểm soát: hạn mức Pro (dừng/tiếp tục), thời gian, quyền, che secret
```

Server chủ động chạy các agent và đọc luồng sự kiện trực tiếp từ đầu ra `stream-json` của Claude Code, nên không cần hook để biết ai đang làm gì. Hook chỉ là tính năng tùy chọn để quan sát thêm các phiên Claude Code bạn tự mở bằng tay.

### 4.1 Công cụ giao việc theo từng tầng

Các agent không tự do gọi nhau. Mỗi tầng chỉ được cấp vài công cụ do server cung cấp, thông qua một MCP server cục bộ mà mỗi tiến trình `claude -p` được nạp bằng `--mcp-config`:

| Tầng | Công cụ | Việc |
|------|---------|------|
| Giám đốc | `assign_to_team(team, mô_tả, tiêu_chí_đạt)` | Giao một phần việc cho team |
| Giám đốc | `ask_owner(câu_hỏi)` / `report_to_owner(tổng_kết)` | Hỏi bạn / nộp kết quả cuối |
| Trưởng nhóm | `get_team_workload()` | Xem tải từng thành viên |
| Trưởng nhóm | `assign_to_member(member, title, description, acceptance, files, level)` | Giao việc nhỏ cho một người. Server kiểm tra giới hạn tải, trùng phạm vi `files`, trùng tiêu đề, số việc con tối đa. *(đã làm; `level` do Trưởng nhóm gán, bỏ trống thì hệ thống tự đánh giá)* |
| Trưởng nhóm | `review_submission(task_id, verdict, feedback)` | Duyệt (approve) hoặc trả bài (reject, kèm nhận xét). Quá số lần trả thì việc con bị đánh dấu chưa đạt. *(đã làm)* |
| Nhân viên | `submit_work(tóm_tắt, file_thay_đổi)` | Nộp bài. *(chưa làm: hiện nhân viên nộp bằng báo cáo cuối của lượt chạy)* |
| Nhân viên | `ask_lead(câu_hỏi)` | Hỏi Trưởng nhóm khi vướng. *(chưa làm)* |

Mọi giao tiếp đi qua server nên **được ghi lại, kiểm soát và vẽ lên 3D**. Công cụ đi qua một **cầu nối MCP** (`server/mcp-bridge.mjs`, giao thức stdio) mà Claude Code khởi động theo `--mcp-config`. Cầu nối gọi lại máy chủ cục bộ kèm một **mã thông báo riêng của từng lượt chạy**, mã này mất hiệu lực khi lượt kết thúc, và máy chủ chỉ cho dùng đúng công cụ của loại lượt đó (lập kế hoạch hay duyệt bài). Đã kiểm chứng bắt tay với Claude Code thật.

### 4.2 Tránh nhân viên đạp lên nhau

Mỗi nhân viên làm trong **git worktree / nhánh riêng**. Trưởng nhóm gộp nhánh nhân viên trong team, Giám đốc hoặc bạn gộp giữa các team. Các việc chạm cùng file được cảnh báo trước khi giao song song.

### 4.3 Cách chạy một nhân viên với gói Pro

Mỗi lần giao việc, server khởi động một tiến trình Claude Code không giao diện, đại ý:

```
claude -p                                   # nội dung việc truyền qua stdin, không qua dòng lệnh
  --output-format stream-json --verbose     # đọc từng bước để vẽ 3D và ghi nhật ký
  --append-system-prompt-file <file>        # vai trò + hồ sơ dự án + quy tắc công ty
  --tools <công cụ của vai trò, + Skill>    # chỉ liệt kê công cụ có sẵn (bớt token, không có Task)
  --allowedTools <công cụ + lệnh Bash trong allowed_commands>
  --disallowedTools "Bash(git push) ..."
  --permission-mode default                 # KHÔNG dùng acceptEdits: nó cho Bash ghi file, lách hook chặn thư mục
  --settings <file>                         # hook PreToolUse chặn cứng file ngoài phạm vi (path-guard.mjs)
  --setting-sources project,local           # bỏ hook/plugin cấp người dùng (xem lưu ý bên dưới)
  --strict-mcp-config                       # chỉ nạp MCP trong --mcp-config (chỉ lượt của Trưởng nhóm có)
  --model <theo vai trò>                    # theo bảng mục 3.8
  --effort <theo vai trò>
  --plugin-dir <gói skill của vai trò>      # chỉ nạp skill của vai trò đó (mục 3.8)
  --max-turns <trần theo việc>
  --resume <mã phiên>                       # chỉ khi làm tiếp sau khi hết hạn mức
  (chạy trong worktree riêng của việc; chưa nối --fallback-model)
```

**Điều đã kiểm chứng khi làm giai đoạn 1 (Claude Code 2.1.308, gói Pro):**
- **Không dùng được `--bare`:** chế độ đó chỉ nhận khóa API, không đọc đăng nhập Pro.
- **Phải dùng `--setting-sources project,local`:** không có nó, các hook cấp người dùng (ví dụ plugin Vercel trên máy bạn) chèn hơn 10 KB ngữ cảnh vào mỗi lần chạy, tốn hạn mức vô ích.
- Sự kiện khởi động xác nhận `apiKeySource: "none"` (không dùng khóa API), `permissionMode: acceptEdits`, không có MCP server nào, và 5 skill của công ty được nạp dưới tên `company-skills:...`.
- Ngay cả một lần gọi gần như trống vẫn tốn khoảng 20 nghìn token ngữ cảnh nền (công cụ, chỉ dẫn hệ thống), nên **ít việc lớn rẻ hơn nhiều việc vụn**.

Hệ quả khi dùng Pro:
- **Không có khoản tiền theo từng lần gọi**, nhưng có **hạn mức theo khung thời gian**. Hạn mức là thứ quý nhất, nên cái cần kiểm soát là *lượng dùng* chứ không phải đô la.
- Server đo lượng dùng của từng việc, từng người từ dữ liệu trả về và hiển thị trên bảng tải. Đây là số **ước lượng**, vì Pro không công bố hạn mức chính xác.
- Khi chạm hạn mức, server **tạm dừng cả công ty**, nhớ trạng thái, và **tự tiếp tục khi hạn mức hồi** (dùng `--resume` để agent làm tiếp, không làm lại từ đầu). Chi tiết ở mục 4.4.
- Cách này dùng đúng Claude Code trên máy bạn cho công việc của bạn. Bạn nên tự đọc điều khoản của gói Pro về việc chạy tự động nhiều phiên song song trước khi bật chạy dài, vì tôi không thể xác nhận thay bạn.
- Vì bạn chọn **dùng hết hạn mức**, khi công ty đang chạy thì việc bạn tự mở Claude Code cho việc khác cũng có thể bị chặn do dùng chung hạn mức. Giao diện có nút **"Nhường chỗ"** để tạm dừng công ty khi bạn cần dùng.

### 4.4 Khi hết hạn mức Pro: dừng, chờ, tự tiếp tục (không dùng API)

**Vì sao không dùng API:** API là cách dùng Claude trả tiền theo lượng dùng thật, **tách hẳn khỏi gói Pro**. Gói Pro không kèm sẵn khoản dùng API nào, nên dùng API là tốn tiền riêng. Bạn không muốn tốn thêm tiền, nên công cụ **không có chế độ API**.

**Khi chạm hạn mức Pro, công ty làm như sau, hoàn toàn tự động, không hỏi bạn:**

| Bước | Việc xảy ra |
|------|-------------|
| 1 | Công cụ nhận ra tiến trình `claude -p` báo hết hạn mức |
| 2 | Không giao thêm việc mới. Các việc đang dở được **lưu trạng thái** (kèm mã phiên để `--resume`) và chuyển sang "chờ hạn mức" |
| 3 | Giao diện hiện đồng hồ đếm ngược tới giờ hồi; trong 3D cả công ty nghỉ giải lao (mục 5) |
| 4 | Đến giờ hồi, công cụ tự thử lại. Thành công thì mọi người về bàn và **làm tiếp đúng chỗ dở**, không làm lại từ đầu |
| 5 | Nếu thử mà vẫn hết hạn mức thì chờ thêm rồi thử lại, không dồn dập |

**Giờ hồi lấy từ đâu:** nếu thông báo hết hạn mức của Claude Code có kèm giờ hồi thì công cụ đọc giờ đó. Nếu không có hoặc đọc không được thì công cụ thử lại sau mỗi khoảng thời gian tăng dần. Cách nhận ra thông báo này sẽ được thử thật ở giai đoạn 1, vì định dạng thông báo có thể đổi theo phiên bản Claude Code.

**Ngăn việc vô tình bị tính tiền API:** nếu trên máy bạn có sẵn biến môi trường `ANTHROPIC_API_KEY` (ví dụ do công cụ khác cài), Claude Code có thể dùng nó và tính tiền. Vì vậy:
- Công cụ **xóa biến này** khỏi môi trường của mọi tiến trình `claude` mà nó chạy.
- Lệnh `doctor` **cảnh báo** nếu máy bạn đang có khóa API, và kiểm tra Claude Code đang đăng nhập bằng tài khoản Pro.
- Công cụ không đọc, lưu hay hỏi khóa API ở bất kỳ đâu.

**Hệ quả bạn đã chọn:** tốc độ làm việc bị giới hạn bởi hạn mức Pro. Việc lớn có thể kéo dài qua nhiều lần hạn mức hồi. Đổi lại không phát sinh chi phí nào ngoài gói bạn đang có.

---

## 5. Văn phòng 3D: hiển thị luồng công việc và tải

Mỗi team có **khu làm việc riêng** (một cụm bàn, bảng tên team), Giám đốc ở phòng riêng gần bàn Chủ.

| Điều xảy ra | Cảnh trong văn phòng |
|-------------|----------------------|
| Bạn tạo việc | Tờ giấy xuất hiện trên bàn Chủ |
| Giám đốc lập kế hoạch | Giám đốc đứng ở bảng trắng, các phần việc hiện dần theo team |
| Giao xuống team | Tờ giấy đi tới bàn Trưởng nhóm của team đó |
| Trưởng nhóm chia việc | Từng tờ nhỏ đi từ bàn Trưởng nhóm tới bàn từng nhân viên |
| Hàng chờ của mỗi người | **Chồng giấy trên bàn** cao dần theo số việc đang chờ |
| Người quá tải | Đèn bàn cam rồi đỏ, nhân viên toát mồ hôi; việc mới chuyển sang người rảnh |
| Nhân viên đọc code | Đi tới thư viện |
| Nhân viên sửa file | Ngồi gõ phím, màn hình hiện tên file |
| Nhân viên chạy lệnh, test | Vào phòng server |
| Nộp bài | Cầm tập hồ sơ đi tới bàn Trưởng nhóm |
| Chờ bạn duyệt | Giơ tay, đèn **vàng**, chuông kêu |
| Việc lỗi hoặc bị trả | Đèn **đỏ** trên bàn, nhân viên gãi đầu |
| Hoàn thành | Hiệu ứng nhỏ, tờ giấy vào tủ hồ sơ |
| Hết hạn mức Pro | Cả công ty **nghỉ giải lao**: nhân viên ra khu lounge, đồng hồ trên tường đếm ngược tới lúc hồi, hết giờ thì tất cả về bàn làm tiếp |

Ngoài 3D còn có:
- **Bảng kanban** theo trạng thái việc, lọc theo team hoặc người.
- **Bảng tải team**: mỗi người đang làm gì, hàng chờ bao nhiêu, đã tốn bao nhiêu.
- **Nhật ký hội thoại** giữa các tầng.
- **Chế độ danh sách 2D** cho máy yếu.

---

## 6. Kiểm soát (quan trọng khi dùng cho công việc thật)

| Mối lo | Biện pháp |
|--------|-----------|
| Agent ngốn hết hạn mức Pro | **Trần số lượt, thời gian và số lần làm lại** mỗi việc; trần chạy đồng thời (mặc định 2); hiển thị lượng dùng ước lượng của từng người, từng team; chạm hạn mức thì tạm dừng cả công ty và tự tiếp tục khi hồi (mục 4.4); cho chọn model nhẹ hơn cho vai trò ít cần suy luận |
| Agent chạy vòng lặp vô tận | Giới hạn số lượt, thời gian, số lần làm lại; chặn lệnh lỗi lặp lại |
| Agent làm việc nguy hiểm (xóa, push, lệnh lạ) | Danh sách lệnh cho phép theo vai trò; lệnh ngoài danh sách hiện thành **thẻ chờ bạn duyệt**; lệnh rủi ro cần bấm hai lần |
| Làm hỏng code đang có | Mỗi người một nhánh/worktree; có nút hoàn tác; không tự push |
| Vô tình bị tính tiền API | Công cụ không có chế độ API; xóa biến `ANTHROPIC_API_KEY` khỏi môi trường của mọi tiến trình `claude` do nó chạy; lệnh `doctor` cảnh báo nếu máy bạn đang có khóa API (mục 4.4) |
| Lộ secret | Che token/key trước khi lưu và hiển thị; không đọc file `.env` trừ khi bạn cho phép |
| Không biết ai đã làm gì | Mọi giao việc, duyệt bài, lệnh đã chạy đều ghi vào nhật ký, không sửa được |
| Nút dừng khẩn | Một nút dừng toàn bộ agent, và nút dừng riêng từng team |

---

## 7. Cấu trúc thư mục dự kiến

```
<thư mục dự án của bạn>\.my-company\     ← repo này, clone vào từng dự án (mục 3.7)
├─ KE-HOACH.md
├─ teams\                  ← khai báo team, nhân viên, vai trò (mục 3.1)
├─ local\                  ← cấu hình riêng cho dự án này: project.md, đội hình chỉnh sửa (không commit)
├─ skills\                 ← gói skill theo vai trò, đã duyệt (mục 3.8)
├─ skills.lock             ← nguồn, mã commit, giấy phép của từng skill
├─ server\
│   ├─ index.mjs           ← HTTP + SSE
│   ├─ tasks\              ← vòng đời công việc, giao việc, hàng đợi từng người
│   ├─ balancer\           ← giới hạn tải, trần chạy đồng thời, chia lại
│   ├─ agents\             ← chạy agent theo vai trò, công cụ giao việc, quyền
│   ├─ guard\              ← hạn mức Pro, giới hạn, che secret, duyệt lệnh
│   └─ db\                 ← SQLite, schema
├─ app\                    ← Next.js: bảng việc, tải team, nhật ký, duyệt
├─ src\
│   ├─ office\             ← scene three.js
│   ├─ components\
│   └─ i18n\vi.json
├─ hooks\                  ← (tùy chọn) quan sát phiên Claude Code mở bằng tay
├─ tests\
└─ data\                   ← SQLite và log (không commit)
```

---

## 8. Các giai đoạn

### Giai đoạn 0: Khung dự án
> **ĐÃ XONG (5/11/2026).** Next.js 16 + TypeScript + ESLint, máy chủ Node thuần, SQLite dùng `node:sqlite` có sẵn của Node 24 (không cần biên dịch gì thêm). `init`, `start`, `doctor`, `skills list|verify|add` chạy được; đã thử `init` khi công cụ nằm lồng trong một dự án mẫu (gốc dự án tự nhận, `.git/info/exclude` ghi đúng một lần). Xem README.md.

- Khởi tạo Node, Next.js, TypeScript, ESLint, `git init`, schema SQLite.
- Lệnh `init` và `start` cơ bản: nhận ra gốc dự án là thư mục cha, thêm `.my-company/` vào `.git/info/exclude` của dự án.
- Khung `skills/` và `skills.lock`, lệnh `skills add` có bước cách ly và duyệt (mục 3.8).
- **Xong khi:** clone vào một dự án mẫu, chạy `init` và `start`, mở được trang trống ở `localhost:4310`.

### Giai đoạn 1: Một nhân viên làm được một việc
> **ĐÃ XONG, còn vài mục chưa kiểm chứng (5/11/2026).** Hai việc thật (model `haiku`) đã chạy trọn vòng trên dự án mẫu: nhánh riêng, `npm test` chạy qua, tự commit, nhật ký, số liệu dùng; 29 bài kiểm thử tự động đều đạt (dùng `claude` giả, không tốn hạn mức).
>
> **Đã đo:** mỗi việc nhỏ làm bằng `haiku`, 6 lượt, 8 đến 12 giây, làm khung 5 giờ nhích khoảng 1 đến 4 điểm phần trăm (đã gồm phần tôi dùng trong phiên Claude Code này, nên số thật của riêng công ty nhỏ hơn). Chưa đo `sonnet` và `opus` trên việc thật.
>
> **Chưa kiểm chứng, cần làm tiếp:**
> - Hết hạn mức **thật**: chỉ mới thử bằng `claude` giả. Định dạng sự kiện `rate_limit_event` đã quan sát thật ở trạng thái `allowed` (có `resetsAt` và mức dùng từng khung), nhưng giá trị `status` khi bị chặn thì chưa gặp, nên đang coi mọi giá trị không bắt đầu bằng "allowed" là bị chặn.
> - Chưa thử `opus` trên gói Pro của bạn; `--fallback-model` chưa nối.
> - Chưa so sánh có và không có `ponytail`. Agent đã thấy 5 skill và làm đúng TDD, nhưng trong log chưa thấy lần nào nó gọi công cụ `Skill`, nên chưa chứng minh được skill là lý do.
> - Chưa chặn cứng thư mục được sửa theo vai trò (để giai đoạn 2).
> - Phiên của agent có thể có bộ nhớ tự động của Claude Code (thư mục dưới `~/.claude/projects/...`); chưa tắt, chưa đo ảnh hưởng.
>
> **Đã đưa 7 skill vào thư viện sau khi đọc** (xem mục 3.8): `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `ponytail`, `sharp-edges`, `supabase`, `supabase-postgres-best-practices`. Tôi đã bỏ `find-polluter.sh` (script), thư mục `agents/` và `assets/` của `sharp-edges`, và hai file phản hồi của `supabase` (hướng dẫn tạo GitHub Issue, có thể làm rò nội dung hội thoại ra repo công khai). Bản trong thư viện đã được so khớp từng file với bản tôi đã đọc.

- Đọc khai báo team và hồ sơ của dự án chứa nó (viết tay trước, chưa cần bước khảo sát), chạy **một** tiến trình `claude -p` theo vai trò trong worktree riêng. Thử trên một **dự án mẫu nhỏ** do tôi tạo ở thư mục riêng, không đụng dự án thật của bạn.
- Trang web: nhập việc, xem luồng sự kiện trực tiếp, xem kết quả.
- Có trần lượt, thời gian và nút dừng ngay từ đầu.
- **Kiểm tra model:** xác nhận bí danh `opus`, `sonnet` và model nhẹ chạy được trên gói Pro của bạn, đo mức tốn hạn mức của từng model, rồi chỉnh bảng mục 3.8.
- **Đọc và duyệt skill cho vai trò Lập trình viên Backend** (đọc từng `SKILL.md` và script), nạp bằng `--plugin-dir`, xác nhận agent thật sự dùng skill đó và skill không nới quyền lệnh. Chạy cùng một việc có và không có `ponytail` để đo lượng dùng hạn mức.
- **Đo thực tế:** một việc nhỏ ăn bao nhiêu hạn mức Pro, để chỉnh trần chạy đồng thời và cỡ việc ở các giai đoạn sau.
- **Thử cơ chế hết hạn mức:** xác nhận công cụ nhận ra được khi `claude -p` báo hết hạn mức, dừng đúng, và `--resume` tiếp tục được. Nếu Claude Code không cung cấp giờ hồi thì công cụ thử lại định kỳ (mục 4.4).
- **Xác nhận không bị tính tiền API:** chạy khi môi trường có sẵn `ANTHROPIC_API_KEY` giả để chắc chắn công cụ đã gỡ biến đó trước khi chạy `claude`.
- **Xong khi:** bạn giao "viết hàm X và test" cho một lập trình viên và nhận được kết quả có nhật ký, kèm con số lượng dùng.

> Đây là phần rủi ro lớn nhất (hạn mức Pro, quyền, độ ổn định của tiến trình chạy không giao diện). Làm trước để biết có khả thi không, và sẽ xác nhận luôn rằng các cờ dòng lệnh ở mục 4.3 chạy đúng như mong đợi.

### Giai đoạn 2: Một team nhiều người (Backend)
> **ĐÃ XONG (6/11/2026).** Ba việc lớn thật (model `haiku`, dự án mẫu) đã chạy trọn vòng với Claude thật: Trưởng nhóm đọc code và chia việc qua MCP, hai nhân viên làm song song, Trưởng nhóm duyệt từng bài, một bài bị trả lại rồi làm tiếp đúng phiên cũ (`--resume`) kèm nhận xét, và các nhánh đã duyệt được gộp vào `company/job<số>`. 55 bài kiểm thử tự động đều đạt (gồm các trường hợp chạy song song, trả bài quá số lần, xung đột khi gộp, giới hạn tải, dừng việc lớn).
>
> **Đã làm:**
> - **Trưởng nhóm là một agent chỉ đọc** (model `opus` khi lập kế hoạch, `sonnet` khi duyệt bài, chỉnh trong `lead.md`). Công cụ của công ty qua một **cầu nối MCP** (`server/mcp-bridge.mjs`), mỗi lượt chạy có mã thông báo riêng, hết lượt thì mất hiệu lực: `get_team_workload`, `assign_to_member`, `review_submission`.
> - **Luật do máy chủ ép** (mục 3.3): mỗi người tối đa 1 việc đang làm + 2 chờ (cả khi bạn giao việc lẻ); tối đa 6 việc con mỗi việc lớn; việc con phải khai `files` và **không được chồng lấn** nhau (từ chối kèm lý do); không trùng tiêu đề; tối đa 2 lần trả bài (quá thì việc con bị đánh dấu chưa đạt, cần người xem); lượt duyệt không có kết luận thì thử lại một lần.
> - **Gộp nhánh:** các nhánh đã duyệt gộp vào nhánh tích hợp; xung đột thì hủy lần gộp, báo file xung đột, không tự giải quyết. Việc lớn có trạng thái **"Cần bạn xem"** khi còn việc con chưa đạt hoặc có xung đột.
> - **Chặn cứng thư mục theo vai trò** bằng hook `PreToolUse` (`server/path-guard.mjs`): nhân viên chỉ sửa được trong thư mục của team khai ở `local/project.md`; không ai đọc hay sửa được `.env`, `.git`, hay file ngoài worktree; Trưởng nhóm không sửa được gì. Đã thử với Claude thật trên Windows.
> - **Nối `node_modules` vào worktree** (khóa `worktree_links` của hồ sơ dự án) để nhân viên chạy được test trong dự án có phụ thuộc, và không commit nó.
> - **Giao diện:** giao việc lớn cho team, danh sách việc lớn, chi tiết (việc con, lượt của Trưởng nhóm, nhánh gộp, báo cáo), nút dừng việc lớn. Mới kiểm tra qua build và API, **chưa nhìn bằng mắt trên trình duyệt**.
>
> **Phát hiện khi làm:**
> - **`--permission-mode acceptEdits` lách được hook chặn thư mục:** nó tự cho phép Bash ghi file trong worktree (`echo > file`, `mkdir`, `touch`). Đã thử thật: `docs/c.md` được tạo dù ngoài thư mục cho phép. Đã đổi sang chế độ `default` (Edit và Write vẫn chạy nhờ `--allowedTools`; Bash chỉ chạy lệnh được khai); kiểm chứng lại thấy mọi lệnh ghi qua Bash bị từ chối.
> - Bài kiểm thử bắt được một **rò tiến trình**: lệnh dừng đến đúng lúc việc đang tạo worktree thì vẫn khởi động `claude`. Đã sửa (kiểm tra lại ngay trước khi khởi động).
> - Trưởng nhóm duyệt bài tốn 4 đến 11 lượt vì cố chạy lệnh nối nhiều phần (`cd ... && git status`) bị từ chối. Đã dặn chỉ chạy từng lệnh, và cho phép chạy lệnh test của dự án khi duyệt.
>
> **Chưa làm / chưa kiểm chứng:**
> - Công cụ `submit_work` và `ask_lead` (mục 4.1) chưa làm: nhân viên nộp bài bằng báo cáo cuối cùng, chưa có cách hỏi lại Trưởng nhóm giữa chừng.
> - Chưa thử Trưởng nhóm bằng `opus` và nhân viên bằng `sonnet` trên việc thật (mọi lần thử thật dùng `haiku`). Chưa thử Supabase MCP.
> - Trưởng nhóm bằng `haiku` đôi khi bỏ qua yêu cầu phức tạp (một lần đã không trả bài dù được dặn); chất lượng duyệt với model cao hơn chưa đo.
> - Việc con chưa có `depends_on` (để giai đoạn 3); worktree cũ chưa tự dọn.

- Thêm Trưởng nhóm, hàng đợi từng người, `get_team_workload`, giới hạn tải, trần chạy đồng thời, giới hạn thư mục được sửa theo vai trò.
- Mỗi nhân viên một worktree riêng; Trưởng nhóm chia việc, duyệt bài, trả bài làm lại.
- **Xong khi:** giao một việc lớn cho team Backend (ví dụ "thêm API quản lý đơn hàng"), Trưởng nhóm chia cho cả 2 lập trình viên chạy song song, trả bài một lần, và không ai vượt giới hạn tải.

### Giai đoạn 3: Đủ ba team và Giám đốc
> **ĐÃ XONG (6/11/2026).** Hai yêu cầu thật qua cả công ty (Giám đốc `sonnet`, còn lại `haiku`, dự án mẫu) đã chạy; lần thứ hai trọn vòng trong 145 giây: Giám đốc đọc code, chốt **hợp đồng chung** (`computeTotal` trả `{total, count}`, `renderCart` nhận đúng đối tượng đó) và giao 3 việc cho team Backend, Frontend, Chất lượng (Chất lượng phụ thuộc hai team kia); bạn duyệt kế hoạch; Backend và Frontend làm **song song**; Chất lượng bắt đầu sau, trên **mã đã ghép** của hai team kia; kết quả của cả ba team được ghép vào `company/epic2`; Giám đốc đọc code, tự chạy `npm test` (10/10) rồi báo cáo; bạn duyệt kết quả. Tôi chạy lại `npm test` trên nhánh ghép và thấy 10/10, nhánh chính của dự án không bị đụng. 66 bài kiểm thử tự động đều đạt.
>
> **Đã làm:**
> - **Yêu cầu (epic) và Giám đốc** (`server/epics.mjs`): vai trò `director` trong `teams/management/`, chỉ đọc, `opus` khi lập kế hoạch và `sonnet` khi kiểm tra. Công cụ mới qua cùng cầu nối MCP: `get_company_overview`, `set_contract`, `create_team_job`, `finish_epic`.
> - **Hợp đồng chung** lưu trong cơ sở dữ liệu (không phải file trong repo) và được **đính kèm vào mô tả mọi việc của team**, kèm lời dặn "chỉ để tham chiếu, chỉ làm phần được giao".
> - **`depends_on`:** việc có phụ thuộc chỉ bắt đầu khi các việc đó xong; mã gốc của nó là **kết quả đã ghép** của các việc đó (nhánh `company/job<số>-base`). Việc phụ thuộc vào một việc thất bại thì bị hủy dây chuyền.
> - **Hai điểm dừng cho bạn:** duyệt kế hoạch (có thể từ chối kèm nhận xét, Giám đốc lập lại tối đa 2 lần, làm tiếp đúng phiên cũ) và duyệt kết quả cuối cùng. Chưa duyệt thì các team chưa làm gì.
> - **Ghép cả yêu cầu** vào `company/epic<số>`: xung đột thì hủy, báo file, không tự giải quyết. Giám đốc kiểm tra mã đã ghép và được giao **một đợt làm lại**: việc sửa lỗi bắt đầu ngay trên mã đã ghép, `finish_epic` ngay sau đó bị từ chối, rồi ghép lại (`company/epic<số>-r1`) và kiểm tra lần nữa.
> - **Giao diện:** giao yêu cầu cho cả công ty, hai khung duyệt (kế hoạch, kết quả) nổi bật, danh sách việc có phụ thuộc, **bảng kanban** lọc theo team và người, **bảng tải team**, **nhật ký hội thoại** giữa Giám đốc, Trưởng nhóm và nhân viên. Mới kiểm tra qua build và API, **chưa nhìn bằng mắt trên trình duyệt** (môi trường này không có công cụ trình duyệt).
> - **Team Frontend và Chất lượng:** `teams/frontend/`, `teams/quality/` (mỗi team một Trưởng nhóm và 2 nhân viên). Nhân viên Chất lượng chỉ sửa thư mục test khai ở `folders.quality`.
> - **Skill cho các vai trò còn lại:** xem kết quả rà soát ở mục 3.8. Danh sách ban đầu đổi khá nhiều.
>
> **Lỗi thật tìm thấy khi chạy với Claude thật (lần 1 thất bại):** Trưởng nhóm Backend (`haiku`) giao cho Bình toàn file của Frontend và cả test tích hợp của Chất lượng, vì hợp đồng chung mô tả mọi team và không có gì kiểm tra phạm vi file với thư mục của team. Bình bị hook chặn nên bị trả bài 3 lần rồi thất bại, kéo theo việc của Chất lượng bị hủy dây chuyền. Đã sửa ở gốc: (1) `assign_to_member` **từ chối phạm vi file nằm ngoài thư mục của team** (kèm lý do), (2) hợp đồng được dặn rõ là chỉ để tham chiếu, (3) lời nhắc của Trưởng nhóm nêu rõ thư mục của team mình và của team khác. Chạy lại thì đạt.
>
> **Chưa làm / chưa kiểm chứng:**
> - ~~Chưa thử model cao~~ (đã thử ngày 6/11/2026, xem khối "Chạy thật với model mặc định" ngay dưới). Lần chạy đó cho thấy hệ thống tự hạ model theo độ khó nên nhân viên vẫn chạy `haiku`; nhân viên bằng `sonnet` khi ép mức "Bình thường" chưa thử.
> - **Đợt làm lại của Giám đốc chưa thử với Claude thật** (chỉ thử bằng `claude` giả): lần thật, Giám đốc kết luận đạt ngay.
> - Chưa thử tính năng có Supabase thật; chưa có `submit_work` và `ask_lead`.
> - Một việc con thất bại ở team nào thì cả yêu cầu thành "Cần bạn xem" (phần đã xong của team khác vẫn nằm ở nhánh của việc đó); chưa có cách Giám đốc lập lại kế hoạch giữa chừng.
> - Worktree và nhánh cũ chưa tự dọn.

> **Chạy thật với model mặc định (6/11/2026):** một yêu cầu cắt ngang ba team ("đổi nhiệt độ C sang F": hàm backend, nhãn frontend dùng hàm đó, test tích hợp), trên dự án mẫu mới, bằng Claude thật (gói Pro, không API), cấu hình team nguyên bản (không ghi đè). Giám đốc `opus` chốt hợp đồng chung rồi chia ba việc (Chất lượng `depends_on` hai việc kia); Trưởng nhóm lập kế hoạch bằng `opus`/`sonnet`; **nhân viên được hệ thống tự chọn `haiku` mức thấp vì việc đơn giản**; duyệt bài bằng `sonnet`. Tổng 189 giây từ lúc giao đến lúc chờ duyệt kết quả, không ai bị trả bài, không lỗi. Tôi tự chạy lại `npm test` trên nhánh ghép: 26 bài đạt, và gọi thử `tempLabel` bằng tay đúng như tiêu chí. Hạn mức sau lần chạy: 28% theo 5 giờ, 49% theo 7 ngày (con số 7 ngày gồm cả phần bạn dùng Claude Code ngoài công cụ). Chưa thấy trong lần này: vòng trả bài làm lại (Giám đốc hay Trưởng nhóm bắt làm lại), việc con thất bại, nhân viên `sonnet` ở mức "Bình thường", việc lớn hơn nhiều so với ba hàm nhỏ.
>
- Thêm team Frontend, team Chất lượng và Giám đốc; thêm `depends_on` giữa các việc và bước chốt hợp đồng API (mục 3.5); ghép Backend và Frontend; kiểm chéo; vòng đời đầy đủ ở mục 3.4.
- Điểm dừng chờ bạn duyệt kế hoạch và kết quả; bảng kanban, bảng tải team, nhật ký hội thoại.
- Duyệt và nạp skill cho các vai trò còn lại (mục 3.8), tự nâng model khi việc bị trả lại hai lần, và đo xem skill nào thật sự có ích để bỏ skill thừa.
- **Xong khi:** một tính năng full-stack nhỏ (ví dụ đăng nhập bằng email) đi trọn vòng từ bạn xuống Giám đốc, ba team, nhiều nhân viên, rồi báo cáo ngược lên bạn.

### Giai đoạn 4: Văn phòng 3D tĩnh
> **ĐÃ XONG (6/11/2026).** Tab "Văn phòng 3D" hiện đúng 10 nhân vật theo cấu hình thật (1 Giám đốc, 3 Trưởng nhóm, 6 nhân viên). Đã kiểm tra bằng **trình duyệt Edge thật** (qua `playwright-core`, không tải thêm trình duyệt), ở cả chế độ sáng và tối: WebGL bật, đủ 10 nhân vật, bấm vào Trưởng nhóm, nhân viên và Giám đốc đều mở đúng khung thông tin, bấm vào một việc thì chuyển sang tab Công việc, xoay và zoom đổi góc nhìn, không có lỗi hay cảnh báo nào trong console. Tôi đã xem ảnh chụp và chỉnh camera, cỡ chữ, vị trí biển phòng, vòng đánh dấu người được chọn theo ảnh. 71 bài kiểm thử tự động đều đạt.
>
> **Đã làm:**
> - **Bố cục là hàm thuần** (`src/office/layout.ts`), kiểm thử được không cần WebGL: dải sau gồm bàn Chủ, phòng Giám đốc (kính), thư viện (kệ sách), phòng server (tủ rack); dải giữa là khu của từng team (mỗi team một màu), Trưởng nhóm ngồi hàng sau, nhân viên hàng trước. Co giãn theo cấu hình: thêm nhân viên thì khu rộng ra, thêm team thì thêm khu. Test kiểm tra: đúng số người từng team, không ai ngồi chồng nhau, mọi người nằm trong khu hoặc phòng của mình.
> - **Cảnh three.js** (`src/office/scene.ts`): nhân vật low-poly vẽ bằng khối cơ bản (tóc và da khác nhau theo tên; Trưởng nhóm có vương miện vàng, Giám đốc có cà vạt), tên và vai trò hiện trên đầu, camera xoay, zoom, dịch; vẽ lại **chỉ khi có thay đổi** nên không tốn CPU khi đứng yên; giải phóng bộ nhớ khi rời tab.
> - **Bấm vào nhân vật** (phân biệt bấm với kéo): khung bên phải hiện vai trò, team, model, trạng thái, các việc đang mở và 3 việc gần nhất; bấm vào một việc để mở nó ở tab Công việc.
> - **Đèn trạng thái trên bàn** (suy từ việc đang mở, `src/office/status.ts`): xanh lá đang làm, xanh dương chờ duyệt, cam có việc đang chờ, xám rảnh. Đã thử đổi trạng thái trong trình duyệt và phóng to thấy đèn đổi màu đúng. Mới nối dữ liệu thật qua bài kiểm thử, chưa quan sát với công việc đang chạy thật.
> - **Dự phòng khi không có WebGL:** hiện danh sách nhân sự theo team kèm trạng thái, vẫn bấm xem việc được. Có khai báo `aria-label` và dòng tóm tắt số người cho trình đọc màn hình.
> - Cảnh 3D chỉ tải khi mở tab (three.js khá nặng).
>
> **Chưa làm / chưa kiểm chứng:**
> - Chưa thử trên điện thoại hay màn hình cảm ứng, và chưa thử với GPU thật (kiểm tra dùng WebGL mềm của Edge); hiệu năng với văn phòng rất đông người chưa đo.
> - ~~Chưa có hoạt ảnh~~ (đã làm ở giai đoạn 5, xem bên dưới).
> - Bố cục chỉ dựng lại khi cấu hình team thay đổi (tải lại trang); chưa tự cập nhật khi bạn sửa file team lúc đang chạy.

- Scene three.js: bàn Chủ, phòng Giám đốc, khu từng team, thư viện, phòng server.
- Nhân vật low-poly, tên và vai trò hiện trên đầu, camera xoay/zoom, bấm vào nhân vật xem việc đang làm.
- **Xong khi:** thấy đúng số nhân vật theo từng team như khai báo.

### Giai đoạn 5: Luồng công việc sống trong 3D
> **ĐÃ XONG (6/11/2026).** Văn phòng phản ánh công việc thật theo bảng mục 5. 91 bài kiểm thử tự động đạt (20 bài mới cho phần này), kiểm tra kiểu, lint và build sạch. Đã kiểm chứng bằng **máy chủ thật + `claude` giả (không tốn hạn mức) + Edge thật**, hai lần chạy liền, không có lỗi hay cảnh báo trong console: giao một yêu cầu cho cả công ty, quan sát từng thứ trong bảng dưới, duyệt kế hoạch và kết quả; rồi giả lập chạm hạn mức Pro để xem cả công ty nghỉ giải lao và làm tiếp. Cũng đã thử chế độ "giảm chuyển động" của hệ điều hành. Tôi xem ảnh chụp và chỉnh theo đó (thẻ tên chồng nhau ở phòng nghỉ, bảng hiệu đè bảng tên khu, camera cắt mất mép dưới, giấy và bóng nói quá nhỏ).
>
> **Đã làm (trừ hai thứ nêu ở mục chưa kiểm chứng, đều thấy trong lần chạy sống):**
> - **Giấy bay** (`src/office/flow.ts`, `diffFlows`): so hai lần cập nhật dữ liệu để suy ra giấy cần bay: Chủ → Giám đốc → Trưởng nhóm → nhân viên khi giao việc; nhân viên → Trưởng nhóm khi nộp bài (giấy xanh); Trưởng nhóm → nhân viên khi trả lại (giấy đỏ); vào tủ hồ sơ khi xong việc, việc lớn, yêu cầu (giấy xanh lá, có đốm sáng); Giám đốc → Chủ khi kế hoạch hoặc kết quả chờ duyệt. Chỉ bay theo thay đổi xảy ra *khi bạn đang xem tab*; mở tab giữa chừng thì bắt đầu từ trạng thái hiện tại. Cập nhật hàng loạt (nối lại sau mất mạng) bị chặn ở 12 tờ, và các tờ bay lần lượt cách nhau 0,35 giây.
> - **Đi lại**: đọc code thì ra thư viện, chạy lệnh thì vào phòng server, Giám đốc lập kế hoạch thì ra bảng trắng (có các phần việc theo màu team hiện dần), xong thì về bàn. Đường đi (`planPath`) theo lối đi, có kiểm thử: không cắt qua bàn nào, không ra ngoài sàn, đoạn nào cũng song song với một trục. Phải ngồi tối thiểu 1,2 giây trước khi đứng dậy và ở lại tối thiểu 3,5 giây trước khi đi tiếp để không chạy qua chạy lại mỗi khi đổi công cụ. Đã sửa lại thư viện (chừa lối vào) và phòng server (bỏ hàng tủ rack phía trước) để có chỗ đi.
> - **Biết ai đang đọc hay chạy lệnh** nhờ dòng nhật ký công cụ gần nhất của việc đang chạy (sự kiện `tool` đã có sẵn trong luồng SSE; không đổi máy chủ). Việc nào chưa có sự kiện công cụ thì coi là đang gõ.
> - **Bóng nói trên đầu**: "Sửa login.ts", "Đọc users.ts", "Chạy npm test", "Lập kế hoạch", "Duyệt bài", "Chờ bạn quyết", "Việc bị lỗi".
> - **Chồng giấy** trên bàn theo số việc đang chờ (tối đa 6 tờ hiển thị); **quá tải** khi 1 đang làm + 2 chờ (đúng trần của máy chủ): đèn cam nhấp nháy và toát mồ hôi; **lỗi**: đèn đỏ, gãi đầu, tắt sau 15 phút hoặc khi nhận việc mới; **chờ bạn**: giơ tay vẫy, đèn vàng nhấp nháy, và đèn trên bàn Chủ nhấp nháy.
> - **Hết hạn mức Pro**: cả công ty ra phòng nghỉ (có sofa), bảng hiệu đếm ngược "Nghỉ giải lao · Hồi hạn mức sau mm:ss", hết giờ thì mọi người về bàn. Lấy từ `pausedUntil` của máy chủ.
> - **Thông báo** (`src/lib/notify.ts`): tiêu đề tab "(N) Cần bạn quyết · My Company" ở mọi tab của giao diện, tiếng chuông nhẹ (WebAudio) cho việc *mới* chờ bạn, nút bật/tắt chuông nhớ trong trình duyệt. "Chờ bạn" gồm kế hoạch chờ duyệt, kết quả chờ duyệt, yêu cầu hoặc việc lớn lẻ cần xử lý (xung đột, vượt giới hạn).
> - **Hiệu năng**: cảnh vẫn chỉ vẽ lại khi có thay đổi; chỉ khi có gì đang động (người đi, giấy bay, dáng gõ phím, đèn nhấp nháy) mới chạy liên tục, tối đa khoảng 26 hình mỗi giây. Hệ điều hành bật "giảm chuyển động" thì dịch chuyển tức thì, không giấy bay, không nhấp nháy.
>
> **Khác với bảng mục 5 (có chủ ý):**
> - "Màn hình hiện tên file" thành **bóng nói trên đầu**, vì camera nhìn từ phía trước nên thấy mặt sau màn hình, tên file trên màn hình sẽ không đọc được.
> - "Việc mới chuyển sang người rảnh" **không làm trong 3D**: đó là việc của Trưởng nhóm khi chia việc (máy chủ đã chặn quá tải), 3D chỉ hiển thị.
> - "Cầm tập hồ sơ đi tới bàn Trưởng nhóm" thành **tờ giấy bay** từ bàn nhân viên sang bàn Trưởng nhóm (nhân viên không rời bàn khi nộp bài).
>
> **Làm lại sơ đồ và khung cảnh theo bento grid (6/11/2026, theo yêu cầu "nhìn rất xấu"):**
> - **Sơ đồ** (`src/office/layout.ts`): ba hàng ô bo góc nhiều cỡ, thẳng mép trái và phải, khe giữa các ô đều 0,8 m. Hàng sau: Chủ, Phòng Giám đốc, Thư viện, Phòng server. Hàng giữa: một ô mỗi team, rộng theo số nhân viên. Hàng trước: Phòng nghỉ (rộng) và ô Hồ sơ (nhỏ). Hai lối đi ngang giữa các hàng và hai cột bên (bên phải là lối đi dọc, bên trái là dải cây xanh). Ô, đồ đạc và lối đi đều là dữ liệu thuần trong `layout.ts` nên kiểm thử được.
> - **Khung cảnh** (`src/office/decor.ts`, `kit.ts`): tòa nhà tường kính có thanh chia ô, nền xám lạnh để các ô nổi lên, ô team tô theo màu team, bầu trời chuyển màu, thành phố xa có cửa sổ (ban đêm sáng đèn), bãi cỏ, cây, bụi, sofa, quầy cà phê, tủ hồ sơ, bóng đổ giả dưới bàn và người. Bản tối sáng hơn để các ô vẫn tách khỏi nền.
> - **Kiểm thử mới** (95 bài tổng cộng): ba hàng thẳng mép và khe đều, các ô không chồng nhau, có nhiều cỡ ô, ô nằm trong tường, đồ đạc không đè bàn, và **mọi đường đi có thể có** (bàn → nơi, nơi → bàn, nơi → nơi, cho từng người, với đội hình thật lẫn đội hình nhỏ/lớn) không cắt qua bàn hay đồ đạc nào. Đã chạy lại luồng sống và chế độ giảm chuyển động trong Edge thật trên sơ đồ mới: đạt hết, không lỗi console.
> **Làm lại lần hai: mỗi team một phòng riêng (6/11/2026, theo góp ý "nhìn như các team xếp thành hàng, không có phòng, không có lối đi cho nhân viên"):**
> - Mỗi ô ở hàng giữa là **một căn phòng thật**: tường kính ba mặt, cửa ở mặt trước (đầu lối đi), lối đi trải thảm màu team chạy giữa phòng từ cửa tới cuối phòng, bàn nhân viên xếp thành hàng hai bên lối đi (trái rồi phải, hàng gần Trưởng nhóm trước), Trưởng nhóm ngồi góc sau bên phải, bảng trắng trên tường sau, cây ở góc. Số hàng bàn theo số nhân viên (hai người một hàng), nên team đông thì phòng sâu hơn, và mọi phòng cùng độ sâu để thẳng hàng. Bốn phòng hàng sau (Giám đốc, Thư viện, Phòng server) cũng có tường kính và cửa mở ra lối đi sau.
> - **Đường đi viết lại theo cửa:** nhân viên và Trưởng nhóm đi ngang ra giữa lối đi, thẳng tới cửa trước, ra lối đi trước rồi mới vòng qua mép phải sang lối đi sau để vào thư viện hay phòng server. Giám đốc ra cửa lệch phải của phòng mình. Hệ quả: đi thư viện là một chuyến khá xa (khoảng 8 giây), nên **chỉ đứng dậy khi động tác kéo dài ổn định từ 2,5 giây** (chuỗi Read liên tục vẫn đủ, một lệnh thoáng qua thì không); nghỉ giải lao thì đi ngay.
> - **Kiểm thử mới** (98 bài): mỗi team có phòng riêng và cửa; **mọi đường đi có thể có không cắt qua tường nào** (lấy mẫu từng 5 cm trên từng đoạn đường, với mọi người, mọi cặp nơi); lối đi giữa phòng thông suốt từ cửa tới cuối phòng; bàn hai bên lối đi và nằm gọn trong tường; Trưởng nhóm phía sau nhân viên; phòng sâu theo số hàng bàn. Bài này bắt được một lỗi thật: với đội hình đông (22 người), chỗ đứng ở phòng nghỉ trải rộng đến đụng quầy cà phê; đã sửa khoảng trải.
> - **Camera tự đặt** để thấy trọn bề ngang tòa nhà theo tỉ lệ khung hình, nhìn từ trên xuống khoảng 46 độ; thôi tự đặt lại khi bạn đã tự xoay hoặc zoom.
> - Chạy lại trong Edge thật với dữ liệu sống: đạt hết (cả giao yêu cầu, hết hạn mức, giảm chuyển động), không lỗi console. Hai lỗi trong lần chạy đầu đều là do thời gian của bài kiểm thử (đường dài hơn nên chờ lâu hơn), riêng lỗi "chạy qua chạy lại vì một lệnh thoáng qua" là lỗi thiết kế thật nên đã thêm điều kiện ổn định ở trên.
> **Làm lại lần bốn: 3D isometric theo ảnh mẫu và thêm bản 2D pixel art (6/11/2026, theo ảnh "đây là 3D tôi muốn hướng tới" và yêu cầu "kèm nút 2D pixel art")**: bỏ hẳn bản three.js dựng bằng khối hộp. Tách **bộ mô phỏng** (`src/office/sim.ts`: ai ở đâu, đi đâu, làm gì, rảnh thì làm gì) ra khỏi hình vẽ để dùng chung cho hai kiểu vẽ và **kiểm thử được bằng Node với đồng hồ giả** (trước đó nó dính chặt vào three.js nên không kiểm thử được). Hai bộ vẽ cùng giao diện `OfficeScene` (`scene-types.ts`), chọn bằng `create.ts`, nút 3D | 2D ở `Office3D.tsx` (nhớ trong `localStorage`; không có WebGL thì tự dùng 2D thay cho danh sách thay thế cũ).
>
> - **3D** (`iso.ts`, `chibi.ts`, `furniture3d.ts`, `world3d.ts`): camera trực giao isometric cố định (kéo để dịch, cuộn để zoom, không xoay); nhân vật chibi (đầu to, mắt chấm đen, má hồng, tóc nhiều kiểu, vương miện cho Trưởng nhóm, cà vạt cho Giám đốc) với dáng cho từng động tác; đồ đạc bo tròn (`RoundedBoxGeometry`), sàn có hoa văn sinh bằng canvas (gỗ, thảm, gạch, đá hoa), tường kính cong, ánh sáng ấm kèm bóng đổ thật, ánh sáng môi trường (`RoomEnvironment`), tone mapping giữ màu; khu phố quanh nhà (vỉa hè, đường có vạch, zebra, xe, đèn giao thông, đèn đường, cây, nhà xa có cửa sổ; ban đêm sáng đèn); nhãn dạng viên thuốc tối kèm chấm trạng thái như app mẫu.
> - **2D pixel art** (`pixel.ts`, `sprites.ts`): vẽ bằng mã, không dùng tệp ảnh: nhân vật bốn hướng (đi, ngồi, gõ phím, nhấp cà phê, vươn vai, giơ tay...), đồ đạc có viền tối tự động, ba mức sáng tối, hoa văn sàn; khung 16 px = 1 mét; phóng to không làm mờ; nhãn vẽ ở độ phân giải màn hình cho chữ sắc nét; ban đêm nhuộm xanh tím rồi thắp đèn màn hình và đèn bàn.
> - **Kiểm thử mới** (`tests/office-sim.test.mjs`, 9 bài, tổng 102): đọc code thoáng qua thì không đứng dậy, kéo dài thì đi thư viện rồi về; đường đi tốc độ đúng và không xuyên bàn, đồ đạc, tường theo từng bước mô phỏng; nghỉ giải lao; rảnh thì tự đi pha cà phê... không quá 40% ra ngoài, không kẹt ở nơi làm việc; có việc thì bỏ dở; chờ bạn quyết hoặc lỗi thì không đi chơi; giảm chuyển động; văn phòng yên thì ngủ tới giờ hẹn. Đã chạy lại trong Edge thật cho **cả hai chế độ**: luồng sống (giao yêu cầu, duyệt, hết hạn mức), giảm chuyển động, 70 giây không giao việc: đạt hết, không lỗi console.
> - **Thật thà về mức độ giống ảnh mẫu:** app mẫu dùng mô hình do họa sĩ dựng nên chi tiết (bể cá, bàn bi-a, tượng, tủ PC...) nhiều hơn hẳn; tôi đạt phong cách (isometric, chibi, bóng đổ mềm, màu pastel, khu phố) nhưng đồ đạc còn đơn giản hơn. Hai lỗi do bản mới: bóng đổ thật làm khung hình chậm khi không có card đồ họa (trình duyệt kiểm tra của tôi dùng WebGL mềm); bộ mô phỏng nay cho "đi bù" tới 0,5 giây mỗi khung để người không đi chậm theo khung hình, đường đi vẫn nằm trên các điểm đã kiểm chứng. Chưa thử trên card đồ họa thật hay điện thoại. Bản 2D chưa có xe cộ ngoài đường.
>
> **Làm lại lần ba: tầng văn phòng đủ chức năng và hoạt động lúc rảnh (6/11/2026, theo góp ý "bố cục xếp phòng không thực tế" và "nếu tôi không làm gì thì nhân viên phải làm gì đó")**: bỏ hẳn kiểu bento và phòng riêng từng team. Thay bằng một tầng văn phòng thật: dải sau là bảy phòng kính (Chủ, Giám đốc, hai phòng họp, Thư viện, Server, Hồ sơ) có cửa ra lối đi; giữa là không gian làm việc mở, mỗi team một khu thảm màu, bàn xếp thành **cụm bốn bàn đối mặt nhau** (người hàng nam quay lưng về phía camera), có bàn trống, tấm ngăn thấp, góc họp có bảng trắng đứng và bàn tròn; dải trước là WC, pantry, khu nghỉ có sofa, sảnh lễ tân có cửa vào. Đường đi viết lại theo **mạng lối đi** (hai lối ngang, các lối dọc ở hai bên và giữa các khu team; ra khỏi chỗ ngồi theo hướng lưng ghế, ra khỏi phòng qua cửa). Có bàn trống, ghế, hướng ngồi (`facing`), bảng hiệu trên cửa. Bài kiểm thử mới (`tests/office-floor.test.mjs`, 11 bài): sơ đồ đủ chức năng, cụm bàn đối mặt, đồ đạc không chồng nhau, chỗ đứng, **mọi đường đi có thể có không cắt qua bàn, đồ đạc hay tường (lấy mẫu 5 cm)**, lối dọc thông suốt, co giãn theo đội hình nhỏ và lớn. Các bài này bắt được lỗi thật (quầy cà phê chồng tủ lạnh ở pantry).
>
> **Hoạt động lúc rảnh:** người không có việc (và không chờ bạn, không bị lỗi) lên lịch ngẫu nhiên có hạt giống: lúc thì vươn vai, nhấp cà phê, quay đầu nhìn quanh tại bàn; lúc thì đi pha cà phê, họp đứng, ngắm cửa sổ, vào WC, đọc sách, ra khu nghỉ, rồi về bàn. Không quá 40% số người ra ngoài cùng lúc, có việc là bỏ dở quay về. Chạy trong Edge thật 100 giây không giao việc: đủ sáu nơi và ba động tác, tối đa 4/10 người ra ngoài cùng lúc, giao việc thì người đó dừng chơi trong vài giây. Vòng vẽ có hẹn giờ thức dậy nên văn phòng rảnh không vẽ liên tục. Chế độ "giảm chuyển động" tắt hoạt động lúc rảnh (người không chạy qua chạy lại).
>
> **Còn thô:** nhân vật vẫn là khối đơn giản; phòng team còn khá thoáng với đội hình hiện tại (3 người một cụm 4 chỗ); chưa có hội thoại hay họp thật giữa hai người (chỉ đứng cạnh nhau ở pantry hay phòng họp); lịch rảnh là ngẫu nhiên chứ không theo giờ giấc; chưa thử với Claude thật.
>
> - Lỗi tự gây rồi tự bắt: một lần cắt tệp kiểm thử đã xóa nhầm bốn bài cũ; lint báo import không dùng nên phát hiện và khôi phục (95 bài là sau khi khôi phục).
> - Còn thô: thẻ tên của người ở phòng nghỉ đôi chỗ chồng lên bảng tên khu; nền bản tối vẫn khá tối; thư viện và phòng server chỉ có đồ đạc cố định, không có tường (ô bento nên bỏ tường kính từng phòng); chưa chỉnh được bố cục ngoài việc sửa `teams/`.
>
> **Chưa làm / chưa kiểm chứng:**
> - **Giấy đỏ (trả lại làm lại) và đèn đỏ (việc lỗi)** không xảy ra trong lần chạy sống vì không có việc nào bị trả hay bị lỗi. Hai thứ này đã có bài kiểm thử cho phần suy ra dữ liệu, và đã xem ảnh chụp khi ra lệnh thẳng vào cảnh (bóng nói đỏ "Việc bị lỗi", đèn đỏ, giấy đỏ bay), nhưng chưa thấy với một việc thật bị trả.
> - **Tiếng chuông chưa được nghe thật**: kiểm tra chạy trình duyệt không có âm thanh. Phần quyết định *khi nào* rung chuông đã có bài kiểm thử; hàm phát tiếng bọc trong try/catch và trình duyệt có thể chặn âm thanh cho đến khi bạn bấm vào trang một lần.
> - Lần chạy sống dùng `claude` giả. Với Claude thật, thứ tự và thời gian của các sự kiện công cụ sẽ khác (nhiều lệnh Read nối nhau, ít khi chỉ một lệnh), nên người đi thư viện sẽ nhiều hơn; chưa thấy cảnh này với việc thật.
> - Hết hạn mức: đã thấy cả công ty ra nghỉ và về bàn khi máy chủ báo `pausedUntil` (giả lập bằng kịch bản hết hạn mức), chưa thấy lúc Pro thật chạm trần.
> - Đang đi dở mà người đó đổi ý (ví dụ chạy ra thư viện thì có lệnh nghỉ giải lao) thì phải đi hết đoạn đường rồi mới quay lại, không quay giữa chừng.
> - Chưa thử trên điện thoại hoặc màn hình cảm ứng, chưa thử với GPU thật (dùng WebGL mềm của Edge), chưa đo hiệu năng khi văn phòng rất đông người.
> - Phòng nghỉ, tủ hồ sơ, bảng trắng, thư viện và phòng server cố định theo bố cục; chưa chỉnh được số lượng.
> - Thông báo của hệ điều hành (Notification API) chưa làm; chỉ có tiêu đề tab và tiếng chuông.

- Hoạt ảnh theo bảng mục 5: giấy đi xuống từng tầng, chồng giấy theo hàng chờ, đèn báo quá tải, đi các phòng, gõ phím, giơ tay chờ duyệt.
- Thông báo (âm thanh nhẹ, tiêu đề tab) khi cần bạn duyệt.
- **Xong khi:** không cần mở bảng việc vẫn hiểu từng team đang làm gì và ai đang quá tải.

### Giai đoạn 6 (tùy chọn, làm theo nhu cầu thật)
- Thêm team **DevOps** (CI/CD, triển khai, môi trường), **Thiết kế UI/UX**, **Bảo mật / review code** (kèm skill Trail of Bits ở mục 3.8), và thêm người vào team.
- Nhân viên xin ý kiến nhau trực tiếp, họp ngắn.
- Mẫu việc dùng lại (ví dụ "sửa lỗi", "viết tính năng", "viết báo cáo").
- Báo cáo tuần: số việc xong, lượng dùng hạn mức theo team, ai làm nhiều nhất.
- Xem từ điện thoại có mã PIN (đã xong ở đợt 6E); thông báo đẩy (đã xong ở đợt 6F).
- Việc định kỳ (ví dụ mỗi sáng kiểm tra build).

> **Đợt 6F xong (6/11/2026): thông báo đẩy.** `server/push.mjs` (thư viện `web-push` 3.6.7 làm phần mã hóa RFC 8291 và chữ ký VAPID, đúng kế hoạch), `server/owner-requests.mjs`, bảng `push_subscriptions`, bốn route `/api/push/{key,subscribe,unsubscribe,test}` (ở cổng từ xa chỉ phiên đã đăng nhập mới tới được), `src/lib/push.ts`, nút "Thông báo" + "Gửi thử" ở Dashboard, `push` và `notificationclick` trong `public/sw.js`. **Khi nào báo:** máy chủ lắng nghe sự kiện `epic`/`job`/`state` của runner và báo khi một yêu cầu/việc lẻ **chuyển vào** trạng thái chờ bạn (cùng quy tắc `ownerRequests`: `awaiting_plan`, `awaiting_result`, `attention`) hoặc khi hạn mức hồi. **Khác kế hoạch:** kế hoạch ghi khóa chống trùng `loại:id:trạng thái`; nếu lưu khóa đó vĩnh viễn thì yêu cầu bị trả kế hoạch rồi lập lại (cùng trạng thái `awaiting_plan` lần hai) sẽ không bao giờ báo lại. Tôi đổi sang theo dõi **chuyển trạng thái** (nhớ trạng thái gần nhất của từng yêu cầu/việc; lúc khởi động nạp trạng thái hiện có để không báo lại cái đã chờ sẵn). Quy tắc "cần bạn" được chép sang JS (máy chủ chạy Node thuần, không nạp `.ts`), và một bài kiểm thử so khớp với `src/office/status.ts` trên mọi tổ hợp trạng thái. **Bảo mật:** địa chỉ đăng ký do trình duyệt gửi rồi máy chủ POST tới đó, nên là đường SSRF: chỉ https, chỉ FCM / Mozilla / Windows / Apple khớp tuyệt đối theo nhãn tên máy (không IP, không localhost, không `user:pass@`, không cổng lạ, `fcm.googleapis.com.evil.com` bị chặn), kiểm lại lần nữa ngay trước khi gửi; khóa thiết bị phải đúng độ dài và dạng; thiết bị đăng ký qua cổng từ xa gắn với băm phiên, nên đăng xuất / hết hạn / đổi PIN thì thôi nhận (kiểm ngay lúc gửi, không cần ai gọi đăng xuất); nội dung chỉ có `{title, body, tag}` đã che bí mật, cắt ngắn; trần 20 thiết bị và 20 thông báo/10 phút, nút gửi thử cách nhau 5 giây; 404/410 xóa đăng ký, lỗi khác đếm và xóa sau 10 lần liên tiếp; tắt máy chủ chờ lượt gửi dở xong. Khóa VAPID ở `data/vapid.json` (tệp hỏng thì tạo lại và xóa đăng ký cũ vì khóa cũ không dùng được nữa). Chủ đề (`Topic`) làm các thông báo cùng loại thay nhau ở dịch vụ đẩy. **Kiểm thử để tìm lỗi, 24 bài mới (tổng 211):** SSRF (nhiều mánh về IP, tên giống, userinfo, cổng, giao thức), khóa rác, chống trùng/lặp/đổi trường khác/lập lại kế hoạch, khởi động lại, che bí mật, hạn mức (chỉ báo khi hồi, không báo khi tạm dừng tay), 404/410/503/lỗi mạng, trần tốc độ, đủ 20 thiết bị, phiên chết, dòng DB bị sửa tay, khóa VAPID hỏng, **gửi thật qua `web-push` tới một dịch vụ đẩy giả rồi giải mã đầu-cuối (RFC 8291) và kiểm chữ ký VAPID bằng khóa công khai**, đăng xuất / đổi PIN, Origin/Content-Type/Sec-Fetch-Site, sự kiện thật của runner, tắt máy chủ giữa lúc đang gửi, service worker chạy trong `vm` với payload hỏng/độc. Tôi cố tình phá ba chỗ then chốt (bỏ kiểm phiên, bỏ danh sách cho phép, bỏ chống lặp) để chắc bài kiểm thử bắt được: cả ba đều bị bắt. Bài kiểm thử lộ **một lỗi thật**: service worker ném lỗi khi payload là JSON `null` nên không hiện thông báo (Safari sẽ thu hồi đăng ký nếu bỏ qua một lần đẩy); đã sửa. **Chạy thật trong Edge (localhost):** bật thông báo thật, khi không đăng ký đẩy được (trình duyệt tự động không có dịch vụ đẩy) thì chuyển sang chế độ "khi mở trang" kèm lời giải thích, và thông báo cục bộ hiện đúng khi tab bị ẩn; với `PushManager` giả: đăng ký lên máy chủ, "Gửi thử" tới nơi, gửi dồn dập bị chặn, máy chủ mất đăng ký thì mở lại trang tự đăng ký lại, tắt thì gỡ. **Chưa kiểm chứng:** **chưa có thông báo đẩy thật nào tới thiết bị thật** (cần FCM/Apple/Mozilla thật, trình duyệt có đăng ký đẩy, và HTTPS thật của Tailscale); chưa thử iPhone (phải "Thêm vào Màn hình chính" mới có đẩy); nếu dịch vụ đẩy của bạn dùng tên máy ngoài danh sách thì đăng ký bị từ chối và phải thêm vào `COMPANY_PUSH_HOSTS`; thông báo bấm vào chỉ mở lại trang gốc, chưa nhảy thẳng tới yêu cầu cần duyệt; tên "Windows (WNS)" và Apple dựa trên định dạng địa chỉ đã biết, chưa gặp thực tế; kênh `topic` có thể làm dịch vụ đẩy gộp hai thông báo cùng loại nếu thiết bị tắt máy lâu (chủ ý).
>
> **Đợt 6E xong (6/11/2026): truy cập từ xa bằng PIN, giao diện điện thoại, PWA.** **Thiết kế khác kế hoạch đã duyệt ở một điểm quan trọng:** thay vì một cổng và dựa vào tiêu đề Host, máy chủ mở **hai cổng**. Cổng chính (4310) chỉ cho trình duyệt trên máy này, không PIN; cổng từ xa (`COMPANY_REMOTE_PORT`, mặc định 4311, chỉ nghe loopback, chỉ bật khi đặt `COMPANY_PUBLIC_HOST`) **luôn** đòi PIN. Lý do: qua `tailscale serve` mọi yêu cầu đến từ 127.0.0.1 và tiêu đề Host do máy khách đặt, nên "Host là localhost thì tin" có thể bị giả; tin hay không tùy **cổng nào nhận kết nối** thì không giả được. Phòng thêm: cổng chính từ chối yêu cầu mang tiêu đề proxy (`X-Forwarded-*`, `Tailscale-User-*`...), phòng khi ai đó trỏ nhầm Tailscale vào cổng chính. `server/auth.mjs`: PIN băm scrypt + muối trong `data/auth.json` (đổi/xóa PIN đổi `epoch` nên mọi phiên cũ chết ngay, không cần chạm DB); phiên là mã ngẫu nhiên 256 bit, bảng `sessions` chỉ lưu băm SHA-256, cookie `__Host-mc_session` (`HttpOnly; Secure; SameSite=Strict`), hạn 30 ngày, tối đa 20 phiên; chống đoán PIN theo **toàn cục** (5 sai/15 phút thì khóa 15 phút, gấp đôi mỗi lần, tối đa 24 giờ; đang khóa thì PIN đúng cũng bị từ chối; luôn tính scrypt khi có PIN để thời gian không tiết lộ gì). Cổng từ xa: Host phải đúng tên máy công khai; POST bắt buộc `Origin` đúng; `Sec-Fetch-Site: cross-site` bị chặn; `/api/agent/*` không bao giờ chạm tới (404 kể cả đã đăng nhập); không WebSocket; chưa đăng nhập chỉ thấy trang PIN do máy chủ tự dựng (CSP có nonce, không tải mã giao diện nào) trừ sáu tệp PWA khớp tuyệt đối từng đường dẫn; luồng SSE tự ngắt khi đăng xuất/đổi PIN/hết hạn. CLI: `npm run pin -- set|clear|status` (nhập ẩn), `doctor` có mục từ xa. Giao diện: khối **"Cần bạn quyết"** lên đầu (gồm cả việc lớn cần chú ý), nút Đăng xuất, 401 thì tự về trang PIN, tab cuộn ngang, nút ≥44px trên màn cảm ứng, safe-area, 2D mặc định trên điện thoại, nhãn 2D bớt chồng khi thu nhỏ; **đã hết tràn ngang 68px** (đo lại: 390px đúng 390px ở cả năm tab). PWA: `app/manifest.ts`, biểu tượng PNG, `public/sw.js` (không bao giờ đụng `/api/*`, chỉ hiện trang ngoại tuyến khi mất mạng). **Kiểm thử để tìm lỗi, 28 bài mới (tổng 187):** giả Host/Origin/Sec-Fetch-Site, đoán PIN (cả giả X-Forwarded-For, cửa sổ trượt, khóa gấp đôi, đầu vào quái dị như số/mảng/1 MB), cookie giả (sai tên, trùng tên, thiếu tiền tố, SQL), đường dẫn lắt léo (`//x/sw.js`, `%2e%2e`, `/sw.js/`, `/icons/..%2f`), gọi route agent qua cổng từ xa kể cả có mã agent thật, đổi/xóa PIN khi đang chạy, sống qua khởi động lại, SSE bị ngắt. Chúng chỉ lộ **một** lỗi thật: `normalizePublicHost` nhận `box.ts.net/..` (đã siết); còn lại là lỗi bài kiểm thử (ECONNRESET do dùng lại kết nối khi máy chủ từ chối mà chưa đọc thân yêu cầu, và `eval` của playwright bị CSP chặn). **Đã chạy thật trong Edge ở khung 390px**, qua một proxy HTTPS tự dựng giả Tailscale (chứng chỉ tự ký, thêm `X-Forwarded-*`): PIN sai báo lỗi, PIN đúng vào được, cookie đúng cờ và JavaScript không đọc được, các tab không tràn ngang, 2D là mặc định, service worker đăng ký được trên localhost. **Tự rà bảo mật** (không dùng `/security-review` vì cả kho chưa commit nên không có diff, và để đỡ tốn hạn mức): các điểm còn lại ghi dưới đây. **Chưa kiểm chứng / hạn chế:** chưa thử với Tailscale thật và điện thoại thật (chứng chỉ thật, `tailscale serve`, thêm vào màn hình chính, cảm ứng, hiệu năng 2D/3D trên máy yếu); service worker chưa đăng ký được qua HTTPS tự ký (trình duyệt từ chối chứng chỉ tự ký, đây là giới hạn của cách thử); khóa đoán PIN là toàn cục nên ai đó trong mạng Tailscale cố tình nhập sai sẽ khóa được cổng từ xa (không vào được, nhưng chủ máy vẫn vào bằng cổng chính); ứng dụng Next chưa có CSP riêng (React tự thoát ký tự, nhưng chưa có lớp chắn thứ hai); nếu ai đó bật `tailscale funnel` thì cả Internet chạm tới trang PIN (README cấm; chống đoán PIN vẫn giữ); `data/auth.json` chỉ được bảo vệ bằng quyền thư mục người dùng (Windows không có chmod). Điểm còn ghi nhận: giao diện điện thoại chưa có chế độ bố cục riêng cho màn hình xoay ngang; nhãn tên team 2D khi thu nhỏ vẫn hơi bị cắt ở 390px.
>
> **Đợt 6D xong (6/11/2026): nhân viên hỏi nhau, họp ngắn.** `server/questions.mjs` + bảng `questions`; ba công cụ `ask_lead`, `ask_colleague`, `call_meeting` cho nhân viên (nay có `--mcp-config` riêng, chỉ với ba công cụ này); trạng thái việc mới `waiting_answer`; loại việc mới `answer` (chỉ đọc, ngắn, kết quả cuối chính là câu trả lời). Hỏi theo kiểu **không chờ**: nhân viên kết thúc lượt, việc chờ, đủ câu trả lời thì `--resume`. **Khác kế hoạch đã duyệt:** bỏ `submit_work` (báo cáo cuối hiện có đã là bài nộp, thêm công cụ chỉ thêm một chỗ có thể sai) và bỏ công cụ `answer_question` (câu trả lời là kết quả cuối của lượt `answer`). **Kiểm thử để tìm lỗi, 24 bài mới (tổng 159):** đua nhau (câu trả lời đến trước hoặc sau lúc người hỏi kết thúc lượt), người trả lời lỗi/treo/trả rỗng/chạm hạn mức, dừng việc hoặc việc lớn khi đang chờ, `stopAll`, khởi động lại (cả câu hỏi mồ côi), việc lớn không được duyệt hay gộp sớm khi việc con còn chờ, họp có kết cục lẫn lộn, người hỏi hết số lượt ngay sau khi hỏi, mã thông báo cũ và quyền công cụ, giới hạn và che bí mật. Chúng làm lộ 4 lỗi, đều là lỗi của bản giả lập hoặc bài kiểm thử chứ không phải sản phẩm: lượt trả lời tiếp tục sau hạn mức bị bản giả lập nhận nhầm là nhân viên (ghi file vào thư mục người hỏi), biến môi trường giả lập rò sang bài sau (2 lần), và hai điều kiện kiểm tra tôi viết ngược. Đã sửa `max_turns` sau khi hỏi (vẫn chờ trả lời, không bị nâng bậc model). Báo cáo tuần có cột `answers` riêng. Giao diện: cột "Đang chờ" của kanban có việc chờ trả lời, trạng thái "Chờ trả lời", giấy vàng/tím bay trong văn phòng 3D và 2D, nhật ký hội thoại hiện câu hỏi và trả lời (không lặp lệnh công cụ thô). **Chạy thật với Claude thật (1 lần, 46 giây, model `haiku` ở mức thấp cho người hỏi):** An được giao việc thiếu ngưỡng miễn phí vận chuyển, tự gọi `ask_lead`, kết thúc lượt đúng như được dặn; Trưởng nhóm Minh (`sonnet`) đọc code (Grep, Glob, Read), trả lời trung thực rằng repo không có số nào và đây là quyết định nghiệp vụ; An được gọi lại bằng `--resume`, không bịa số, báo cáo chưa viết code kèm lý do. **Chưa kiểm chứng:** chưa thấy người trả lời đưa ra thông tin hữu ích thật (câu hỏi thử không có đáp án trong code); `call_meeting` chỉ thử bằng bản giả lập, chưa với Claude thật; chưa thấy nhân viên tự hỏi mà không được dặn (ở lần thử tôi dặn thẳng trong đề bài); văn phòng chưa có cảnh cả nhóm vào phòng họp (chỉ có giấy bay, chưa chụp lại bằng Edge); lượt trả lời dùng model của người trả lời nên có thể tốn hạn mức nếu hay họp. Hạn mức sau lần chạy: 75% theo 5 giờ, 54% theo 7 ngày.
>
> **Đợt 6C xong (6/11/2026): ba team mới và thêm người.** `teams/devops/` (Khôi, Sơn), `teams/design/` (Ngọc, Vy), `teams/security/` (Hải, Trinh), thêm Hương vào Backend và Phong vào Frontend: tổng 18 người, 6 team làm việc. Thân `team.md` nay là **mô tả phạm vi** (`teams.mjs` đọc vào `team.description`), `get_company_overview` in ra, và lời nhắc của Giám đốc **không còn ghi cứng ba team** (`epics.mjs`), nên thêm team không cần sửa code. DevOps chỉ chuẩn bị tệp, không triển khai; Thiết kế viết đặc tả, không viết code; Bảo mật chỉ viết báo cáo vào `docs/security`. Skill: duyệt thêm `differential-review` (Trail of Bits, chỉ tài liệu, đọc hết SKILL.md và các tệp trước khi duyệt; bỏ `agents/` và `assets/`); `sharp-edges` đã có. **Ba skill còn lại trong kế hoạch không được nạp:** `supply-chain-risk-auditor` cần `uv`/Python có mạng, `static-analysis` cần CodeQL/Semgrep, `insecure-defaults` không có SKILL.md; nhân viên không chạy được chương trình ngoài. Văn phòng 3D và 2D vẫn dựng đúng với 18 người, 6 khu (đã chụp lại bằng Edge thật, các bài kiểm tra đường đi/va chạm đạt không cần sửa bố cục); ở 2D nhãn tên chồng nhau khi thu nhỏ hết cỡ. 2 bài mới (tổng 135) và 5 bài sửa lại vì ghi cứng đội hình cũ. **Chạy thật bằng Claude thật (model mặc định):** một yêu cầu "rà soát bảo mật và đặc tả nhãn nhiệt độ". Giám đốc (`opus`) giao đúng cho Bảo mật và Thiết kế, không đụng team khác; Trinh viết báo cáo, Trưởng nhóm Bảo mật **trả bài một lần** rồi duyệt (đây là lần đầu thấy vòng trả bài với Claude thật), báo cáo nêu thẳng phần chưa rà vì lệnh `node -e` bị chặn; Vy viết đặc tả đủ trạng thái kèm tệp token. **Việc không ghép được** vì kho thử còn nhánh `company/job1`, `company/job2` từ lần chạy trước (DB mới đánh số lại từ 1): đây là điểm yếu có thật của sản phẩm (nhánh cũ chưa tự dọn, tên nhánh chưa tránh trùng), chưa sửa. Hạn mức sau lần chạy: 63% theo 5 giờ, 53% theo 7 ngày. **Chưa kiểm chứng:** DevOps chưa được giao việc thật; Thiết kế → Frontend theo `depends_on` chưa chạy thật; người rà soát không đọc được lịch sử git nếu `allowed_commands` không thêm `git log`/`git blame`.
>
> **Đợt 6B xong (6/11/2026): báo cáo tuần.** `server/report.mjs` gom từ bảng `tasks`/`jobs`/`epics` theo tuần ISO (giờ máy): theo team, theo người, so với tuần trước, Markdown tải về, route `GET /api/report`; bảng mới `quota_samples` ghi mức dùng hạn mức (thưa 10 phút một mẫu, luôn ghi lúc chạm trần và lúc hết chặn) ở chỗ `runner.mjs` nhận `rate_limit_event`; thêm chỉ mục `tasks(finished_at)`. Giao diện: tab "Báo cáo" (chuyển tuần, thanh so sánh team, bảng xếp hạng, nút tải Markdown). 9 bài kiểm thử mới (tổng 133), đã xem trong Edge thật với dữ liệu dựng tay. **Chưa kiểm chứng / hạn chế:** chưa xem với dữ liệu của một tuần chạy thật bằng Claude thật; việc được tính vào tuần chứa lúc kết thúc (việc chạy xuyên đêm Chủ nhật sang thứ Hai tính cho tuần sau); số liệu hạn mức không có cho thời gian trước đợt 6B; ước tính giá API lấy từ `total_cost_usd` Claude Code báo, không phải hóa đơn.
>
> **Đợt 6A xong (6/11/2026): mẫu việc và việc định kỳ.** Mẫu là tệp `templates/*.md` (và `local/templates/`), nạp bởi `server/templates.mjs`; bốn mẫu gửi kèm. Việc định kỳ ở `server/scheduler.mjs` + bảng `schedules`, đồng hồ tiêm vào được nên kiểm thử không phải chờ. Chính sách bạn đã chọn: **tắt sẵn, tự chạy có trần** (một lần mở mỗi lịch, bỏ qua khi tạm dừng, trần ngày, chạy bù một lần trong 3 giờ, thử lại sau 10 phút khi lỗi). API: `/api/templates`, `/api/templates/:id/{render|run}`, `/api/schedules` và `/api/schedules/:id/{enable|disable|run-now|delete}`. Giao diện: tab "Mẫu & lịch" và ô "Dùng mẫu có sẵn" trong form giao việc. 22 bài kiểm thử mới (tổng 124), đã xem trong Edge thật (tạo lịch, bật, chạy ngay, khóa nút khi còn việc mở). **Chưa kiểm chứng:** lịch tự chạy đúng giờ với Claude thật (chỉ thử bằng đồng hồ giả và bộ chạy giả); mẫu "Kiểm tra build" cho việc không có thay đổi tệp nào chưa chạy qua Claude thật (mã xử lý việc rỗng đã có nhưng chưa thấy cảnh này); giờ chạy theo múi giờ của máy, chưa kiểm tra lúc đổi giờ mùa hè; lịch chỉ chạy khi máy chủ đang mở. Giao diện điện thoại từng tràn ngang 68px ở màn 390px (đã sửa ở đợt 6E).
- Trang trí và chi tiết đời sống văn phòng.

---

## 9. Rủi ro lớn nhất

1. **Hạn mức gói Pro.** Đây là rủi ro lớn nhất của bản này. Nhiều người chạy song song có thể cạn hạn mức trong khung thời gian ngắn, lúc đó cả công ty phải dừng, kể cả khi bạn tự dùng Claude Code cho việc khác (hạn mức dùng chung). Giảm bằng trần chạy đồng thời thấp, chọn model nhẹ cho vai trò đơn giản, việc nhỏ, đo thực tế ở giai đoạn 1. Vì bạn chọn dùng hết hạn mức, việc bạn tự dùng Claude Code lúc công ty chạy cũng có thể bị chặn (có nút "Nhường chỗ"). Hết hạn mức thì công ty dừng và tự tiếp tục khi hồi; tốc độ làm việc bị giới hạn bởi Pro, đó là đánh đổi bạn đã chọn khi không dùng API. Việc lớn có thể kéo dài qua nhiều lần hạn mức hồi.
2. **Hồ sơ dự án sai thì quyền sai.** Hồ sơ quyết định thư mục và lệnh nào được phép, nên bạn luôn duyệt hồ sơ do agent đề xuất trước khi dùng.
3. **Chia việc quá vụn hoặc quá thô.** Nhiều tầng chia việc dễ sinh việc nhỏ lẻ, phối hợp tốn hơn làm. Giảm bằng chỉ dẫn tốt, mẫu việc, trần kích thước việc, và bạn duyệt kế hoạch ở MVP.
4. **Xung đột khi nhiều người sửa chung file.** Giải bằng worktree riêng, cảnh báo trùng file, và gộp có kiểm soát.
5. **Chi phí phối hợp.** Mỗi lần giao việc và báo cáo qua nhiều tầng đều tốn hạn mức. Nên dựng dần từng team, bắt đầu từ Backend, rồi đo xem có đáng.
6. **Độ ổn định của tiến trình chạy không giao diện.** Cần giới hạn, thử lại, và lưu trạng thái để dừng rồi tiếp tục được.
7. **Sa đà vào 3D.** Mỗi giai đoạn có tiêu chí "xong khi"; 3D đặt sau khi phần giao việc chạy được.
8. **Skill từ GitHub chứa chỉ dẫn hoặc script xấu.** Skill là nội dung agent làm theo và có thể chạy script trên máy bạn. Giảm bằng quy trình ở mục 3.8: chỉ lấy từ nguồn đã chọn, ghim đúng commit, đọc toàn bộ trước khi dùng, không tự cập nhật, và skill không được nới quyền lệnh.
9. **Skill ăn hạn mức mà không có ích.** Mô tả skill chiếm chỗ trong ngữ cảnh của mọi lần chạy. Giảm bằng giới hạn 4 đến 5 skill mỗi vai trò và loại skill không đo được lợi ích ở giai đoạn 3.
10. **Agent chạm vào dữ liệu Supabase thật.** Migration sai hoặc lệnh SQL sai trên dự án chạy thật có thể mất dữ liệu, và nội dung đọc từ database có thể chứa chỉ dẫn độc hại lừa agent. Giảm bằng cách làm việc trên bản Supabase local, không có lệnh đẩy lên dự án thật, MCP nếu bật thì chỉ đọc và chỉ nối dự án phát triển, và cấm dùng khóa `service_role` (mục 3.8).

---

## 10. Kiểm thử

- **Bộ máy công việc và cân tải:** test vòng đời việc, giới hạn tải, chia lại khi nghẽn, bằng agent giả (không tốn tiền).
- **Quyền và an toàn:** test từng vai trò bị chặn đúng những lệnh không được phép.
- **Đầu cuối:** vài việc mẫu nhỏ, chạy thật, để không tốn nhiều hạn mức.
- **Chế độ demo:** `?demo` phát sự kiện giả để xem 3D mà không cần chạy agent.

---

## 11. Câu hỏi cần bạn chốt

1. ~~**Loại công việc**~~ Đã chốt: công ty lập trình full-stack.
2. ~~**Công nghệ**~~ Đã chốt: thay đổi theo từng dự án, nên dùng hồ sơ dự án (mục 3.6).
3. ~~**Đăng nhập**~~ Đã chốt: gói Claude Code Pro, chạy bằng `claude -p` (mục 4.3).
4. ~~**Dự án để thử**~~ Đã chốt: repo này clone vào từng dự án (mục 3.7). Khi phát triển tôi dùng một dự án mẫu nhỏ để thử.
5. ~~**Đội hình**~~ Đã chốt: giữ như mục 3.2 (Backend, Frontend, Chất lượng, mỗi team 1 trưởng nhóm và 2 nhân viên).
6. ~~**Hạn mức và API**~~ Đã chốt: chỉ dùng Pro, không dùng API; dùng hết hạn mức; hết thì dừng và tự tiếp tục khi hồi, không hỏi (mục 4.4).
7. **Mức tự động:** ở MVP bạn có sẵn sàng duyệt *cả kế hoạch lẫn kết quả* mỗi việc, hay muốn cho chạy tự động hơn (rủi ro cao hơn)?
8. **Phong cách hình ảnh và tên:** low-poly đơn giản như đã giả định, tên "My Company", hay có chủ đề riêng?
9. ~~**Model và skill**~~ Đã chốt: dùng bảng model và danh sách skill ở mục 3.8 (gồm UI UX Pro Max, PonyTail, Playwright, Supabase). Chưa thêm skill khác; cần thì bạn nói sau.
10. **Supabase:** dự án Supabase của bạn dùng bản đám mây hay chạy local, và đã có bản **phát triển** tách riêng với bản chạy thật chưa? (Mặc định: agent chỉ làm trên bản local hoặc bản phát triển, không bao giờ đụng bản chạy thật.)

---

## 12. Bước tiếp theo

Bạn xem qua và sửa những chỗ chưa đúng ý. Mục 11 chỉ còn ba câu 7, 8 và 10, đều có mặc định (duyệt cả kế hoạch lẫn kết quả; low-poly, tên "My Company"; Supabase chỉ làm trên bản local hoặc bản phát triển), bỏ qua thì tôi dùng mặc định. Sau khi bạn đồng ý, tôi bắt đầu **Giai đoạn 0 và 1**, rồi dừng để bạn thử một việc thật trước khi làm team, Giám đốc và 3D.
