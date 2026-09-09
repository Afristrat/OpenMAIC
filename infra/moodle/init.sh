#!/bin/sh
set -eu
a2enmod headers >/dev/null
install -d -o www-data -g www-data -m 2770 /var/www/moodledata
