# 一口異世界「対決」— Render Web Service版 1.3

**今回の一式だけを使ってください。Docker・Python・Blueprint・外部データベースは不要です。**

設定は、Language = **Node**、Build Command = **npm install**、Start Command = **npm start**。必須の環境変数はありません。

## 1. GitHubへ置く

古いファイルと混ざらないよう、新しい空のリポジトリ（例：`hitokuchi-taiketsu-render`）へアップロードする方法を推奨します。公開範囲はPrivateで構いません。前のリポジトリやRenderサービスを削除する必要はありません。

ZIPを展開し、展開したフォルダーを開いて、中身のファイルをすべて選択します。GitHubの「Add file → Upload files」または初期画面の「uploading an existing file」からアップロードし、mainブランチに保存してください。ZIPそのものや外側のフォルダーはアップロードしません。

正しい配置は次のとおりです。ファイルはすべて同じ階層にあります。

```text
リポジトリの最上位
├── package.json
├── package-lock.json
├── server.cjs
├── game-core.cjs
├── index.html
├── game.html
├── test.cjs
├── README.md
└── .gitignore
```

**GitHubでリポジトリを開いた最初の画面に `package.json` と `server.cjs` が見えれば正しい配置です。** `.gitignore` は環境によって隠しファイルに見えます。このファイルがなくても起動には影響しません。

前回の `Dockerfile`、`render.yaml`、Pythonのファイル、ZIP、テスト用のセーブデータは今回のリポジトリへ追加しないでください。

## 2. RenderのWeb Serviceを作る

Renderの「New + → Web Service → Git Provider」で、上記のGitHubリポジトリを接続します。「Existing Image (Docker)」や「Static Site」「Blueprint」は使用しません。以前のDocker用サービスをそのまま再デプロイするのではなく、今回は新しいNodeのWeb Serviceを作る流れです。

| 項目 | 入力内容 |
|---|---|
| Name | `hitokuchi-taiketsu-play` など任意の名前 |
| Language / Runtime | **Node** |
| Branch | `main`（アップロード先のブランチ） |
| Region | そのままで構いません |
| Root Directory | **空欄** |
| Build Command | **`npm install`** |
| Start Command | **`npm start`** |
| Instance Type | **Free** |
| Environment Variables | **追加しない** |

Advancedは通常そのままで構いません。Health Check Pathを設定する場合は `/health` とします。サービスはRenderの `PORT` を読み、`0.0.0.0` で待ち受けます。ポート番号や保存先を手入力する必要はありません。Nodeのバージョン範囲は `package.json` に22.xを指定しています。

「Deploy Web Service」または「Create Web Service」を押します。成功後、サービス画面に表示された `onrender.com` のURLを開きます。

ログに次のように出れば、アプリの起動処理は完了しています。

```text
Hitokuchi Taiketsu 1.3.0 is ready on port 10000
```

実際のポート番号は環境によって異なります。

## 3. 遊び方

キーパーが公開URLを開き、「卓を作成する」を押します。設定初期状態では作成用パスワードの入力欄は表示されません。

発行された **プレイヤー用URLだけ** を相手に送ります。キーパー自身は「KP画面を開く」を押してください。KP用URLはプレイヤーに送らないでください。プレイヤーとKPは異なる端末・ネットワークから参加できます。

プレイヤーは部屋を探索します。キーパーはB側の色パネル、棒や鍵の受け渡し、ボタン、ピースなどを操作します。プレイヤーのゲーム内の視点と調査内容もKP画面に表示されます。デスクトップ全体・他のアプリ・カメラ・マイクの収集はしません。音声通話は含みません。

通常、相手の状態は約1秒ごとに確認されます。操作した本人にはサーバーの応答時に反映されます。通信状況やブラウザのバックグラウンド制限で遅くなることがあります。

同じ役割のURLを複数タブで開くと、後から開いた画面が有効になります。接続が途切れたときは自動再接続します。ボタンを押したまま通信が切れても、無期限に押し続ける状態が残らないようにしています。

## 4. 中断・再開とFreeの注意

**Freeは永続保存用のサーバーではありません。中断前にKP画面の「セーブを書き出す」を押し、JSONファイルを保存してください。**

Render Freeでは無通信が15分続くとサービスが停止し、次のアクセスで再開します。再開に1分程度かかる場合があります。停止・再起動・再デプロイで、サーバーのローカル保存は消えます。このアプリの卓情報も対象です。

再開時に古い招待URLが使えなくなった場合は、新しい卓を作り、KP画面の「セーブを読み込む」からJSONを読み込み、新しいプレイヤー用URLを送り直してください。

KP画面は同じブラウザにも予備セーブを保存します。トップページに「このブラウザの予備セーブ」が出ている場合は、そこから書き出せます。ただしブラウザのデータ削除やシークレットモード等では残らないため、JSONファイルでの保存を優先してください。

プレイ終了後はゲーム画面を閉じてください。Freeの稼働時間枠はワークスペース内の他のFreeサービスと共有されます。通信量とビルド時間にも枠があるため、Freeの選択だけであらゆる利用が無制限・無課金になるわけではありません。

## 5. 任意：第三者による卓作成を制限する

初期状態では、サイトを知っている人は新しい卓を作成できます。ただし、既存の卓への入室にはそれぞれの招待URLが必要です。卓の一覧やKP用の入室鍵を他の利用者へ返す機能はありません。

卓を作れる人を制限する場合のみ、RenderのEnvironmentで次の環境変数を追加します。

```text
ROOM_CREATE_PASSWORD = 自分で決めた十分に長いパスワード
```

再起動後、トップページにパスワード入力欄が表示されます。パスワードをソースコードやGitHubに書き込まないでください。KP・プレイヤーのURLにも秘密の入室鍵が含まれるため、不特定多数へ公開しないでください。

迷う場合、動作確認までは環境変数なしで進められます。なお、一つの接続元から1時間に12回までの卓作成試行、サーバー全体30卓までの制限を設けています。

## 6. エラーが出たとき

| 表示 | 確認する点 |
|---|---|
| `Dockerfile ... no such file` | 古いDocker設定です。今回はLanguageがNodeのWeb Serviceを使います。 |
| `package.json ... ENOENT` | 最上位にpackage.jsonがあるか、Root Directoryが空欄かを確認します。 |
| `Cannot find module ... server.cjs` | server.cjsもアップロードしたか確認します。Start Commandはnpm startです。 |
| `Missing game.html` / `Missing index.html` | ZIPの一部しかアップロードされていません。中身をすべて同じ階層に置きます。 |
| 作成用パスワードを求められる | ROOM_CREATE_PASSWORDが設定されています。既存サービスを流用すると古い環境変数が残ることがあります。 |
| `Internal Server Error` | RenderのLogsで最初のエラーを確認します。/healthが返るかも確認します。HTMLだけをアップロードしても遠隔同期は動きません。 |
| 初回アクセスが遅い | Freeの起動待ちの可能性があります。少し待って再読込します。 |
| 招待URLが無効 | 卓が消えた可能性があります。新しい卓を作ってセーブを読み込みます。 |

## 7. 同梱ファイルと実装範囲

`index.html` が卓作成画面、`game.html` がプレイヤー・KP共通のゲーム画面です。ゲーム本体のJavaScript、表示用スタイル、描画処理、効果音生成処理はgame.html内にまとめています。画像CDN、外部フォント、音声ファイルのダウンロードは使いません。

`server.cjs` がHTTP通信と保存、`game-core.cjs` がサーバー側のゲームルールです。Node.js標準機能だけを使い、npmの追加依存パッケージはありません。クライアントから任意のプログラムを実行する仕組みはありません。サーバー側で役割と操作内容を確認します。

通信は同じサイトへのHTTP方式に統一しています。別のWebSocketサーバー、API用ドメイン、CORS設定、データベース、外部認証サービスは不要です。サーバーは1プロセス・1インスタンスで動かしてください。

保持したゲームの変更：開始時のA表示を隠す／体を調べると刻印に気づく／棒が穴から約3秒で出てクリック取得／選択した道具を対象へ使う／注水後に水が消える／注水音／開く扉にピースが追従する／KPの遠隔操作／視点プレビュー。

実装範囲は「始まりの部屋」と「協力の間」です。「対決の間」以降はKPが進行します。旧版のversion 1形式のセーブデータを読み込む処理は残していますが、旧版の招待URLを新サイトでそのまま使うことはできません。

## 8. 確認結果とローカル起動

Node.js 22.16.0の手元環境で、依存パッケージなしのインストール、起動、APIの46項目、ブラウザ操作の24項目を確認しました。開始から扉の開放、KPとの同期、役割の分離、再接続、セーブの復元、注水音の波形、扉とピースの回転を含みます。

ブラウザ試験は、テスト環境の直接URL移動制限のため、テスト専用のHTTP転送アダプターを使い、2つの独立したブラウザ環境とローカルの実サーバーを接続しています。配布ファイルにそのアダプターは含まれません。**Render上での公開デプロイを実行した結果ではありません。**

Node.jsがあるPCでは、フォルダーで次を実行できます。GitHub経由でRenderへ公開するだけならPCへのNode.jsインストールは不要です。

```sh
npm install
npm test
npm start
```

起動後、ブラウザで `http://localhost:10000` を開きます。終了はCtrl+Cです。`npm test` は一時フォルダーと別ポートのテスト用サーバーを使い、通常の探索記録を変更しません。

## 公式の設定資料

手順確認日：2026年10月15日。画面の表記は変更される場合があります。

- Render Web Services: https://render.com/docs/web-services
- RenderのNode設定: https://render.com/docs/deploy-node-express-app
- Nodeバージョンの指定: https://render.com/docs/node-version
- Freeの制限: https://render.com/docs/free
- GitHubへのアップロード: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository