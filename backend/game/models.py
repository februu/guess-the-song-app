# models.py
from django.conf import settings
from django.db import models


class SpotifyToken(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    access_token = models.TextField()
    refresh_token = models.TextField()
    expires_at = models.DateTimeField()
