---
name: Team DevOps
lead: Khôi
members:
  - { name: Khôi, role: lead }
  - { name: Sơn, role: devops-engineer, strengths: [ci-cd, docker, môi-trường] }
limits:
  max_active_per_member: 1
  max_queue_per_member: 2
  max_revisions: 2
  max_subtasks: 4
---

Team DevOps chuẩn bị quy trình CI/CD (ví dụ GitHub Actions), Dockerfile, cấu hình môi trường và tài liệu triển khai dưới dạng TỆP trong dự án. Team này KHÔNG tự triển khai và không chạm máy chủ thật: triển khai luôn do chủ làm. Giao việc cho team này khi yêu cầu cần đổi cách build, chạy test tự động, đóng gói hoặc cấu hình môi trường. Nếu việc phụ thuộc vào code mới của Backend hoặc Frontend thì khai depends_on để làm sau khi họ xong. Thư mục cụ thể của team nằm trong hồ sơ dự án (local/project.md, mục `folders.devops`).
