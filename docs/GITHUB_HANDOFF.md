# Chuẩn bị bàn giao GitHub

Repo mục tiêu: git@github.com:HoangHuy1305HP/doFiin.git

Đặt toàn bộ nội dung thư mục backend hiện tại vào gốc source repository (app/, web/, migrations/, tests/, scripts/, docs/...). Tên thư mục local backend không bắt buộc phải là thư mục con trên GitHub.

## Hiện trạng

- Bàn giao source demo 1 trên nhánh main, giữ lịch sử initial commit; không force push.
- Kiểm tra SSH read-only gặp Host key verification failed. Khi đến bước push, cần cấu hình SSH đúng tài khoản và xác minh fingerprint GitHub theo tài liệu chính thức; không tắt StrictHostKeyChecking.
- Đã kiểm tra remote: initial commit 89e01b1, chỉ có README.md. Source demo được ghép trên commit này bằng remote HTTPS.

## Những thứ đưa vào Git

Source Python/React, migration, tests, lockfiles Python/npm, Dockerfile/Compose, .env.example, README, scripts và tài liệu.

## Những thứ giữ riêng

.env, mọi file secret local, .venv, .local-runtime (binary, password, DB), node_modules, web/dist, cache và dữ liệu tài khoản người dùng. .gitignore đã có các nhóm này.

## Kiểm tra trước khi push

1. Chạy TEST_BACKEND.cmd trên PostgreSQL riêng.
2. npm --prefix web ci rồi npm --prefix web run build.
3. Xem git status và git diff --cached để đảm bảo không có secret, dữ liệu DB hoặc binary lớn.
4. Đối chiếu code đang có trên remote và chọn branch phù hợp.
5. Chỉ push khi đã xác nhận phạm vi repo/branch với người quản lý.

Workflow GitHub Actions có kiểm thử PostgreSQL và build web; sẽ chạy khi source được đưa lên repo. Kết quả CI từ xa cần xem trong tab Actions sau khi push.
