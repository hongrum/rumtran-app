# RUM TRẦN KHỎE ĐẸP — image chạy app thật (Node 24 có SQLite tích hợp)
FROM node:24-alpine
WORKDIR /app

# Cài dependency (chỉ production)
COPY package*.json ./
RUN npm install --omit=dev

# Chép mã nguồn
COPY . .

# Dữ liệu SQLite lưu ở /app/data — gắn volume vào đây để không mất dữ liệu
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
