// 試用版（サーバーなし）：サーバーの式・判定をブラウザの中で動かす。APIキーは使わない（Claudeは休止中で、決まった文の手がかりで進む）。
// 注意：試用版では隠れた試作品Bもブラウザの中にある（本番はサーバーだけが持つ）。授業・提出には本番の構成を使う。
// サーバーのコードが読む process.env は、ビルドで globalThis.__trialEnv に置きかえる（vite.trial.config.ts）。
(globalThis as unknown as { __trialEnv: Record<string, string> }).__trialEnv = { TEACHER_PASSPHRASE: "mitate" };
export {};
