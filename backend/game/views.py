# views.py
import secrets
from urllib.parse import urlencode

import httpx
from django.contrib.auth import get_user_model, login
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils.timezone import now, timedelta
from django.views.decorators.http import require_GET

from .services.spotify import get_playlists, get_user_profile

from .models import SpotifyToken

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SCOPES = "playlist-read-private playlist-read-collaborative"


@require_GET
def spotify_login(request):
    state = secrets.token_urlsafe(16)
    cache.set(f"spotify_state_{state}", True, timeout=300)

    params = {
        "client_id": settings.SPOTIFY_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.SPOTIFY_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    }
    url = SPOTIFY_AUTH_URL + "?" + urlencode(params)
    return redirect(url)


@require_GET
def spotify_logout(request):
    if request.user.is_authenticated:
        SpotifyToken.objects.filter(user=request.user).delete()
        request.user.auth_token.delete()
        request.user.delete()
    return JsonResponse({"ok": True, "spotify_disconnected": True})


@require_GET
def spotify_playlists(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"ok": False, "error": "authentication_required"}, status=401
        )

    try:
        playlists = get_playlists(request.user)
    except SpotifyToken.DoesNotExist:
        return JsonResponse(
            {"ok": False, "error": "spotify_token_not_found"}, status=404
        )
    except ValueError as exc:
        return JsonResponse(
            {"ok": False, "error": "spotify_auth_required", "detail": str(exc)},
            status=403,
        )
    except httpx.HTTPStatusError as exc:
        return JsonResponse(
            {
                "ok": False,
                "error": "spotify_http_error",
                "status_code": exc.response.status_code,
                "message": exc.response.text,
            },
            status=502,
        )
    except Exception as exc:
        return JsonResponse(
            {"ok": False, "error": "spotify_fetch_failed", "detail": str(exc)},
            status=500,
        )

    return JsonResponse({"ok": True, "playlists": playlists})


@require_GET
def spotify_user_profile(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"ok": False, "error": "authentication_required"}, status=401
        )

    try:
        profile = get_user_profile(request.user)
    except SpotifyToken.DoesNotExist:
        return JsonResponse(
            {"ok": False, "error": "spotify_token_not_found"}, status=404
        )
    except ValueError as exc:
        return JsonResponse(
            {"ok": False, "error": "spotify_auth_required", "detail": str(exc)},
            status=403,
        )
    except httpx.HTTPStatusError as exc:
        return JsonResponse(
            {
                "ok": False,
                "error": "spotify_http_error",
                "status_code": exc.response.status_code,
                "message": exc.response.text,
            },
            status=502,
        )
    except Exception as exc:
        return JsonResponse(
            {"ok": False, "error": "spotify_fetch_failed", "detail": str(exc)},
            status=500,
        )

    return JsonResponse({"ok": True, "profile": profile})


@require_GET
def spotify_callback(request):
    if request.GET.get("error"):
        return JsonResponse(
            {
                "ok": False,
                "error": "spotify_authorization_failed",
                "message": request.GET.get("error"),
            },
            status=400,
        )

    code = request.GET.get("code")
    state = request.GET.get("state")

    if not code or not state:
        return JsonResponse({"ok": False, "error": "missing_code_or_state"}, status=400)

    state_exists = cache.get(f"spotify_state_{state}")
    if not state_exists:
        return JsonResponse({"ok": False, "error": "invalid_state"}, status=400)

    cache.delete(f"spotify_state_{state}")

    token_resp = httpx.post(
        SPOTIFY_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.SPOTIFY_REDIRECT_URI,
            "client_id": settings.SPOTIFY_CLIENT_ID,
            "client_secret": settings.SPOTIFY_CLIENT_SECRET,
        },
    )

    if token_resp.status_code >= 400:
        return JsonResponse(
            {
                "ok": False,
                "error": "spotify_token_exchange_failed",
                "status_code": token_resp.status_code,
                "message": token_resp.text,
            },
            status=502,
        )

    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in")

    if not access_token or not refresh_token or not expires_in:
        return JsonResponse(
            {"ok": False, "error": "invalid_token_response"}, status=502
        )

    profile_resp = httpx.get(
        "https://api.spotify.com/v1/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if profile_resp.status_code >= 400:
        return JsonResponse(
            {
                "ok": False,
                "error": "spotify_profile_fetch_failed",
                "status_code": profile_resp.status_code,
                "message": profile_resp.text,
            },
            status=502,
        )

    spotify_user_id = profile_resp.json().get("id")
    if not spotify_user_id:
        return JsonResponse(
            {"ok": False, "error": "invalid_spotify_profile"}, status=502
        )

    User = get_user_model()
    username = f"spotify_{spotify_user_id}"[:150]
    user, _ = User.objects.get_or_create(username=username)
    if user.has_usable_password():
        user.set_unusable_password()
        user.save(update_fields=["password"])

    login(request, user)

    SpotifyToken.objects.update_or_create(
        user=user,
        defaults={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": now() + timedelta(seconds=expires_in),
        },
    )

    return JsonResponse({"ok": True, "spotify_connected": True})
