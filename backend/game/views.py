# views.py
import secrets
from urllib.parse import urlencode

import httpx
from django.contrib.auth import alogin, get_user_model, logout
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
    """Redirect the user to Spotify's OAuth2 authorization page with a CSRF state token."""
    state = secrets.token_urlsafe(16)
    cache.set(f"spotify_state_{state}", True, timeout=300)

    params = {
        "client_id": settings.SPOTIFY_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.SPOTIFY_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
        "show_dialog": "true",
    }
    url = SPOTIFY_AUTH_URL + "?" + urlencode(params)
    return redirect(url)


@require_GET
def spotify_logout(request):
    """Revoke the user's Spotify token, end their session, and delete their account."""
    if request.user.is_authenticated:
        SpotifyToken.objects.filter(user=request.user).delete()
        user = request.user
        logout(request)
        user.delete()
    return JsonResponse({"ok": True, "spotify_disconnected": True})


@require_GET
async def spotify_playlists(request):
    """Return the authenticated user's Spotify playlists."""
    user = await request.auser()
    if not user.is_authenticated:
        return JsonResponse(
            {"ok": False, "error": "authentication_required"}, status=401
        )

    try:
        playlists = await get_playlists(user)
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
async def spotify_user_profile(request):
    """Return the authenticated user's Spotify profile data."""
    user = await request.auser()
    if not user.is_authenticated:
        return JsonResponse(
            {"ok": False, "error": "authentication_required"}, status=401
        )

    try:
        profile = await get_user_profile(user)
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
async def spotify_callback(request):
    """
    Handle Spotify's OAuth2 redirect, exchange the authorization code for tokens,
    create or retrieve the local user, and log them in.
    """
    frontend_url = settings.FRONTEND_URL

    # Reject if Spotify reported an error
    if request.GET.get("error"):
        return redirect(f"{frontend_url}?auth_error={request.GET.get('error')}")

    code = request.GET.get("code")
    state = request.GET.get("state")

    # Validate CSRF state token that was stored in cache during spotify_login
    if not code or not state:
        return redirect(f"{frontend_url}?auth_error=missing_code_or_state")

    state_exists = await cache.aget(f"spotify_state_{state}")  # type: ignore[attr-defined]
    if not state_exists:
        return redirect(f"{frontend_url}?auth_error=invalid_state")

    await cache.adelete(f"spotify_state_{state}")  # type: ignore[attr-defined]

    async with httpx.AsyncClient() as client:
        # Exchange the one-time authorization code for access + refresh tokens
        token_resp = await client.post(
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
            return redirect(f"{frontend_url}?auth_error=token_exchange_failed")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in")

        if not access_token or not refresh_token or not expires_in:
            return redirect(f"{frontend_url}?auth_error=invalid_token_response")

        # Fetch the Spotify user's ID
        profile_resp = await client.get(
            "https://api.spotify.com/v1/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if profile_resp.status_code >= 400:
        return redirect(f"{frontend_url}?auth_error=profile_fetch_failed")

    spotify_user_id = profile_resp.json().get("id")
    if not spotify_user_id:
        return redirect(f"{frontend_url}?auth_error=invalid_spotify_profile")

    # Create or retrieve the local Django user tied to this Spotify account
    User = get_user_model()
    username = f"spotify_{spotify_user_id}"[:150]
    user, created = await User.objects.aget_or_create(username=username)
    if created:
        user.set_unusable_password()
        await user.asave(update_fields=["password"])

    await alogin(request, user)

    # Persist the tokens so future API calls can refresh them as needed
    await SpotifyToken.objects.aupdate_or_create(
        user=user,
        defaults={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": now() + timedelta(seconds=expires_in),
        },
    )

    return redirect(f"{frontend_url}?spotify_connected=true")
