package ch.fittrack.widgets;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class SupabaseApi {
    // Public project configuration. Never put a secret or service-role key here.
    private static final String SUPABASE_URL = "https://fvaaccshuxkvvythbuon.supabase.co";
    private static final String PUBLISHABLE_KEY = "sb_publishable_6o48cRdF1WYiWadauC3kXw_Y2NCS5i7";
    private static final long REFRESH_MARGIN_MS = 60_000L;
    private static final Object SESSION_LOCK = new Object();

    private final SessionStore sessionStore;

    SupabaseApi(Context context) {
        sessionStore = new SessionStore(context.getApplicationContext());
    }

    SessionStore.Session currentSession() {
        return sessionStore.load();
    }

    SessionStore.Session signIn(String email, String password) throws Exception {
        synchronized (SESSION_LOCK) {
            JSONObject body = new JSONObject().put("email", email).put("password", password);
            JSONObject response = new JSONObject(request(
                "POST",
                "/auth/v1/token?grant_type=password",
                null,
                body
            ));
            SessionStore.Session session = sessionFromResponse(response, null);
            sessionStore.save(session);
            return session;
        }
    }

    void signOut() {
        synchronized (SESSION_LOCK) {
            SessionStore.Session session = sessionStore.load();
            if (session != null) {
                try {
                    request("POST", "/auth/v1/logout?scope=local", session.accessToken, null);
                } catch (Exception ignored) {
                    // Local sign-out must still work when the device is offline.
                }
            }
            sessionStore.clear();
        }
    }

    WidgetData loadWidgetData() throws Exception {
        SessionStore.Session session = validSession(false);
        if (session == null) throw new NotSignedInException();

        try {
            return loadWidgetData(session);
        } catch (ApiException error) {
            if (error.statusCode != HttpURLConnection.HTTP_UNAUTHORIZED) throw error;
            return loadWidgetData(validSession(true));
        }
    }

    private WidgetData loadWidgetData(SessionStore.Session session) throws Exception {
        if (session == null) throw new NotSignedInException();
        String settingsPath = "/rest/v1/app_settings?select=settings&user_id=eq."
            + session.userId + "&limit=1";
        String foodPath = "/rest/v1/food_entries?select=date,calories_kcal,protein_g,carbs_g,fat_g"
            + "&user_id=eq." + session.userId
            + "&date=gte." + WidgetData.startDateKey()
            + "&date=lte." + WidgetData.todayKey();

        JSONArray settingsRows = new JSONArray(request("GET", settingsPath, session.accessToken, null));
        JSONArray foodRows = new JSONArray(request("GET", foodPath, session.accessToken, null));
        JSONObject settings = settingsRows.length() > 0
            ? settingsRows.getJSONObject(0).optJSONObject("settings")
            : null;
        return WidgetData.from(settings, foodRows);
    }

    private SessionStore.Session validSession(boolean forceRefresh) throws Exception {
        synchronized (SESSION_LOCK) {
            SessionStore.Session current = sessionStore.load();
            if (current == null) return null;
            if (!forceRefresh && System.currentTimeMillis() + REFRESH_MARGIN_MS < current.expiresAtMs) {
                return current;
            }

            JSONObject body = new JSONObject().put("refresh_token", current.refreshToken);
            try {
                JSONObject response = new JSONObject(request(
                    "POST",
                    "/auth/v1/token?grant_type=refresh_token",
                    null,
                    body
                ));
                SessionStore.Session refreshed = sessionFromResponse(response, current.userId);
                sessionStore.save(refreshed);
                return refreshed;
            } catch (ApiException error) {
                if (error.statusCode == HttpURLConnection.HTTP_BAD_REQUEST
                    || error.statusCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
                    sessionStore.clear();
                    throw new NotSignedInException();
                }
                throw error;
            }
        }
    }

    private SessionStore.Session sessionFromResponse(JSONObject response, String fallbackUserId) throws Exception {
        JSONObject user = response.optJSONObject("user");
        String userId = user != null ? user.optString("id", fallbackUserId) : fallbackUserId;
        if (userId == null || userId.trim().isEmpty()) throw new Exception("Supabase hat keine Benutzer-ID geliefert.");
        long expiresInSeconds = response.optLong("expires_in", 3600L);
        return new SessionStore.Session(
            response.getString("access_token"),
            response.getString("refresh_token"),
            userId,
            System.currentTimeMillis() + expiresInSeconds * 1000L
        );
    }

    private String request(String method, String path, String accessToken, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(SUPABASE_URL + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(15_000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("apikey", PUBLISHABLE_KEY);
        if (accessToken != null) connection.setRequestProperty("Authorization", "Bearer " + accessToken);

        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
        }

        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300
            ? connection.getInputStream()
            : connection.getErrorStream();
        String response = read(stream);
        connection.disconnect();

        if (status < 200 || status >= 300) {
            throw new ApiException(status, errorMessage(response));
        }
        return response.trim().isEmpty() ? "{}" : response;
    }

    private static String read(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }

    private static String errorMessage(String response) {
        try {
            JSONObject error = new JSONObject(response);
            String message = error.optString("message");
            if (message.trim().isEmpty()) message = error.optString("error_description");
            if (message.trim().isEmpty()) message = error.optString("msg");
            if (!message.trim().isEmpty()) return message;
        } catch (Exception ignored) {
            // Fall through to a concise generic message.
        }
        return "Supabase-Anfrage fehlgeschlagen.";
    }

    static final class ApiException extends Exception {
        final int statusCode;

        ApiException(int statusCode, String message) {
            super(message);
            this.statusCode = statusCode;
        }
    }

    static final class NotSignedInException extends Exception {
        NotSignedInException() {
            super("Bitte die FitTrack Widget-App öffnen und anmelden.");
        }
    }
}
