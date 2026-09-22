export default function SetupPage() {
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-5 p-8">
    <h1 className="text-3xl font-bold">Cấu hình FxBook</h1>
    <p>Ứng dụng cần kết nối Supabase trước khi đăng nhập và lưu nhật ký.</p>
    <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
      <li>Tạo project Supabase và sao chép URL cùng publishable/anon key.</li>
      <li>Tạo <code className="rounded bg-muted px-1">.env.local</code> từ <code className="rounded bg-muted px-1">.env.local.example</code>.</li>
      <li>Áp dụng lần lượt các migration trong <code className="rounded bg-muted px-1">supabase/migrations</code>.</li>
      <li>Khởi động lại máy chủ phát triển rồi mở trang đăng nhập.</li>
    </ol>
    <p className="text-sm text-muted-foreground">Không đặt service role key trong biến môi trường bắt đầu bằng NEXT_PUBLIC_.</p>
  </main>;
}
