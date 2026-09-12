# S3-013 — Migration durable de la politique de sollicitation

Le 12 septembre 2026, les migrations `20260912090000`, `20260912100000` et `20260912110000` ont été appliquées ensemble à la base de production Qalem, après une validation complète sous transaction annulée.

Une sauvegarde de structure préalable, compressée et testée, est conservée dans le répertoire privé de sauvegardes Qalem sur ServeurIA. Son empreinte SHA-256 est `484034345defdbe3bdbe7ddcfd92ff4b49bcc667cea23b46b425ec8bce50a736`.

La relecture confirme les préférences temporelles, les deux tables RLS de budget et de réservation, ainsi que la fonction `claim_notification_delivery_slot`, accessible au seul rôle de service.

Cette preuve ne déploie pas le SHA `b82b4a0`, n’active pas l’ancrage et ne prouve aucune réception physique. Le déploiement reste suspendu jusqu’à la rotation vérifiée des identifiants exposés par un incident Coolify séparé.
