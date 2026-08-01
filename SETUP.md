# 待辦事項 App — 設定說明

一個可以放在手機主畫面、手機與電腦共用同一份資料的待辦事項程式。

- **頁面一「重複排程」**：每天／每週／每兩週／每月要做的事，可新增、編輯、刪除。
- **頁面二「月曆」**：與頁面一同步，可勾選完成、加入單一行程；**不能**在這裡修改或刪除重複排程。

---

## ✅ 目前狀態（2026-08-01）

**已經可以直接使用**：<https://jeremyl861225.github.io/todo-app/>

已完成：Supabase 專案 `dawcpdgonxmhojwonkut` 建立、四張資料表與 RLS 建好、
金鑰已填進 `index.html`、部署到 GitHub Pages。

還沒做的一件事：

- **註冊帳號**。第一次開網頁點「註冊」，用你的 Email 和一組密碼建立帳號。
  目前 Supabase 的 **Confirm email 仍是開啟的**，所以註冊後要去信箱點確認信才能登入。
  想省掉這一步，到 Supabase → Authentication → Sign In / Providers → Email →
  把 **Confirm email** 關掉並 Save（詳見下面步驟三）。

以下步驟是**重新部署一份**或日後要自己重建時才需要看的紀錄。

---

## 步驟一：建立 Supabase 專案

1. 到 <https://supabase.com> 註冊（可用 GitHub 帳號）。
2. 點 **New project**：
   - Name：隨意，例如 `todo`
   - Database Password：自訂一組（之後用不到，但請存起來）
   - Region：選 **Northeast Asia (Tokyo)** 或 Singapore，速度較快
3. 按 **Create new project**，等 1–2 分鐘建置完成。

## 步驟二：建立資料表

1. 左側選單 → **SQL Editor** → **New query**。
2. 把本資料夾裡 [`schema.sql`](schema.sql) 的內容 **全部貼上**。
3. 按 **Run**。看到 `Success` 就完成了。

> 這段 SQL 可以重複執行，不會刪掉既有資料。
> 它也一併開啟 Row Level Security，確保每個帳號只讀得到自己的資料。

## 步驟三：關掉「Email 確認信」（建議）

1. 左側 → **Authentication** → **Sign In / Providers** → **Email**。
2. 把 **Confirm email** 關掉 → **Save**。

> 不關也可以，只是註冊後要先去收信點連結才能登入。

## 步驟四：把金鑰填進程式

1. 左側 → **Project Settings**（齒輪）→ **API Keys**。
2. 複製兩個值：
   - **Project URL**，長得像 `https://abcdefgh.supabase.co`
   - **anon public** key，很長的一串 `eyJ...`
3. 用文字編輯器打開 `index.html`，找到最上方這一段（約在 `<script>` 開頭）：

```js
const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};
```

把兩個值填進去：

```js
const CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....'
};
```

> **anon key 可以公開嗎？** 可以。它本來就設計成放在前端網頁裡，
> 真正的權限由步驟二設定的 Row Level Security 控制——沒有登入就什麼都讀不到，
> 登入後也只讀得到自己的資料。

（若你不想改檔案，也可以直接開啟網頁，程式會顯示設定畫面讓你貼上這兩個值，
但那樣**每一台裝置都要各貼一次**。填進 `index.html` 比較省事。）

---

## 步驟五：放到網路上

因為要在手機開，檔案必須放在一個 `https://` 網址上。最簡單的是 GitHub Pages：

1. 開一個新的 GitHub repository（public 或 private 皆可，Pages 需 public 或付費方案）。
2. 把這個資料夾裡的所有檔案上傳到 repo 根目錄。
3. repo → **Settings** → **Pages** → Source 選 `main` 分支、`/ (root)` → Save。
4. 等一兩分鐘，網址會是 `https://<你的帳號>.github.io/<repo 名稱>/`。

> 提醒：你的 `xxx.github.io` 底下已經有其他 PWA。這個 App 的 `sw.js` 刻意
> **不建立任何快取**，因此不會影響到 Clinical-Tools 或題庫 App 的離線快取。

## 步驟六：加到手機主畫面

> 目前的網址：**<https://jeremyl861225.github.io/todo-app/>**


**iPhone（Safari）**
1. 用 Safari 開上面的網址（Chrome 不行，iOS 只有 Safari 能加入主畫面）。
2. 下方「分享」→ **加入主畫面** → 加入。

**Android（Chrome）**
1. 開網址 → 右上角「⋮」→ **加到主畫面 / 安裝應用程式**。

---

## icon

目前用的是 `checklist.png`，底色 `#EEEEEE`、黑色線條，比例與 Clinical-Tools、每日文獻一致。

| 檔名 | 尺寸 | 圖案佔比 | 用途 |
|---|---|---|---|
| `icon-180.png` | 180×180 | 58.9% | iPhone 主畫面 |
| `icon-192.png` | 192×192 | 58.3% | Android／瀏覽器分頁 |
| `icon-512.png` | 512×512 | 58.2% | Android 啟動畫面 |
| `maskable-512.png` | 512×512 | 36.3% | Android 自動裁形（圓形／方形）用 |

> 「圖案佔比」是黑色圖形的外框相對於畫布的邊長比。一般 icon 一律 **298/512**（左右各留 107px），
> maskable 因為系統會裁掉外圈，縮到 **186/512**（左右各留 163px）。這是 Clinical-Tools
> 與每日文獻沿用的規格，要再換圖時照這個比例縮放就會一致。

日後換圖的做法（來源圖需為 512×512、底色 #EEEEEE、圖案置中）：

```bash
# 先量出來源圖黑色圖形的外框寬度，設為 INK
# 一般 icon：整張縮到 512 × (298/INK)，再補白回 512
sips -z $((512*298/INK)) $((512*298/INK)) checklist.png --out /tmp/m.png
sips -p 512 512 --padColor EEEEEE /tmp/m.png --out icon-512.png
sips -z 192 192 icon-512.png --out icon-192.png
sips -z 180 180 icon-512.png --out icon-180.png
# maskable：把 298 換成 186 重做一次
```

換完重新整理即可（iPhone 需移除主畫面圖示再重新加入）。

---

## 使用說明

### 頁面一：重複排程
- 右下角 **＋ 新增排程**。
- 頻率選 **每兩週** 時會多出「起算日」：從那天算起每 14 天一次，
  可用來決定是「這一週」還是「下一週」開始。
- 頻率選 **每月** 時選幾號；若當月沒有那天（例如 31 號遇到小月），會自動落在該月最後一天。
- 「時間」是自由文字，可以寫 `08:00`，也可以寫「晨會後」。
- 可加任意多筆「相關連結」，自訂名稱＋網址（網址不打 `https://` 也會自動補）。
- 點任一張卡片看完整內容，裡面有「編輯」與「刪除」。

### 頁面二：月曆
- 點日期看那天所有事項；每項左邊的方框可勾選完成，**只影響那一天**。
- 點事項名稱看完整內容。重複排程在這裡只能勾完成，要改內容請回頁面一。
- 右下角 **＋ 新增行程** 可加入不重複的單一行程（例如某天的演講、考試），
  單一行程在月曆頁就可以直接編輯與刪除。

### 類別
右上角「⋮」→ **管理類別**。預設有「教學CR」「臨床事務」，可自行增刪。
新增排程時在類別下拉選單選「＋ 新增類別…」也能直接加。

---

## 資料不會不見

這是設計時的重點，做了四層保護：

1. **雲端**：所有變更立刻寫進 Supabase，換裝置、重灌瀏覽器都還在。
2. **本機快取**：每次變更也存一份在瀏覽器。開啟時先顯示快取再跟雲端對時，
   所以就算當下沒網路或伺服器連不上，看到的仍是最後一次的完整資料，**不會變空白**。
3. **待上傳佇列**：離線時做的新增／修改／刪除會排隊，右上角顯示「待上傳 N」，
   一恢復連線就自動補送；此時關閉分頁瀏覽器會出聲警告。
4. **手動備份**：右上角「⋮」→ **匯出備份 JSON**，存成檔案自己留一份。

右上角那顆小圓點就是同步狀態：`已同步` / `同步中` / `待上傳 N` / `離線`。

---

## 先試用看看

不想馬上設定 Supabase，可以在網址後面加 `?demo=1`：

```
index.html?demo=1
```

會進入試用模式，資料只存在這台裝置的瀏覽器、不會同步，用來先看介面。
正式使用時把 `?demo=1` 拿掉即可（兩邊資料是分開的）。

---

## 疑難排解

| 狀況 | 原因與處理 |
|---|---|
| 一直停在設定畫面 | `CONFIG` 沒填，或 URL 打錯（要是 `https://xxx.supabase.co`，結尾不要有斜線） |
| 登入後跳「資料表尚未建立」 | 步驟二的 `schema.sql` 沒跑成功，回 SQL Editor 重跑一次 |
| 註冊後無法登入 | 沒關 Confirm email，去信箱點確認信；或做步驟三 |
| 右上角一直顯示「待上傳」 | 網路不通，或 `schema.sql` 的 RLS 沒建好。點「⋮」→ 立即重新同步 看有沒有錯誤訊息 |
| 手機看不到電腦新增的事項 | 確認兩邊登入的是同一個 Email；切回 App 時會自動重抓，也可手動「立即重新同步」 |
