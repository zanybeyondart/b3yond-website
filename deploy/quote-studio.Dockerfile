FROM nginxinc/nginx-unprivileged:stable-alpine
COPY public/photo-booth-quote/ /usr/share/nginx/html/
EXPOSE 8080
