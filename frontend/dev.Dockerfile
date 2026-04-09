FROM node:25-alpine
WORKDIR /app
EXPOSE 3000
CMD ["sh", "-c", "npm install && npm run dev"]
