FROM php:8.3-cli-alpine
<<<<<<< HEAD
 
RUN apk add --no-cache curl unzip sqlite-libs sqlite-dev mysql-client \
    && docker-php-ext-install pdo pdo_sqlite pdo_mysql pcntl
 
=======

RUN apk add --no-cache curl unzip sqlite-libs sqlite-dev mysql-client \
    && docker-php-ext-install pdo pdo_sqlite pdo_mysql pcntl

>>>>>>> 4d62a0c3aa44bb18c5d765640a5f9f56f3a4139c
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
 
WORKDIR /app
COPY backend/ .
 
RUN composer install --no-interaction --prefer-dist --optimize-autoloader \
    && php artisan storage:link || true
 
EXPOSE 8000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
 