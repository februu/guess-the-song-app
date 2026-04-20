from django.urls import path

from .views import (
    spotify_callback,
    spotify_login,
    spotify_playlists,
    spotify_user_profile,
)

urlpatterns = [
    path("spotify/login", spotify_login, name="spotify_login"),
    path("spotify/profile", spotify_user_profile, name="spotify_user_profile"),
    path("spotify/playlists", spotify_playlists, name="spotify_playlists"),
    path("callback", spotify_callback, name="spotify_callback"),
]
