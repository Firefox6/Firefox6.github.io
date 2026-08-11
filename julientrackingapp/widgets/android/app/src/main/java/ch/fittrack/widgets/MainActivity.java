package ch.fittrack.widgets;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private LinearLayout loginForm;
    private LinearLayout accountPanel;
    private EditText emailInput;
    private EditText passwordInput;
    private Button loginButton;
    private Button updateButton;
    private Button logoutButton;
    private TextView message;
    private SupabaseApi api;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        api = new SupabaseApi(this);

        loginForm = findViewById(R.id.login_form);
        accountPanel = findViewById(R.id.account_panel);
        emailInput = findViewById(R.id.email_input);
        passwordInput = findViewById(R.id.password_input);
        loginButton = findViewById(R.id.login_button);
        updateButton = findViewById(R.id.update_button);
        logoutButton = findViewById(R.id.logout_button);
        message = findViewById(R.id.message);

        loginButton.setOnClickListener(ignored -> signIn());
        passwordInput.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                signIn();
                return true;
            }
            return false;
        });
        updateButton.setOnClickListener(ignored -> {
            setMessage("Widgets werden aktualisiert …", false);
            WidgetUpdater.showLoadingForAll(this);
            WidgetUpdater.refreshAsync(this);
        });
        logoutButton.setOnClickListener(ignored -> signOut());

        showSessionState(api.currentSession() != null);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void signIn() {
        String email = emailInput.getText().toString().trim();
        String password = passwordInput.getText().toString();
        if (email.isEmpty() || password.isEmpty()) {
            setMessage("Bitte E-Mail und Passwort eingeben.", true);
            return;
        }

        setBusy(true);
        setMessage("Anmeldung läuft …", false);
        executor.execute(() -> {
            try {
                api.signIn(email, password);
                runOnUiThread(() -> {
                    passwordInput.setText("");
                    showSessionState(true);
                    setBusy(false);
                    setMessage("Verbunden. Die Widgets werden jetzt aktualisiert.", false);
                    WidgetUpdater.showLoadingForAll(this);
                    WidgetUpdater.refreshAsync(this);
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    setBusy(false);
                    setMessage(humanMessage(error), true);
                });
            }
        });
    }

    private void signOut() {
        setBusy(true);
        setMessage("Abmeldung läuft …", false);
        executor.execute(() -> {
            api.signOut();
            runOnUiThread(() -> {
                showSessionState(false);
                setBusy(false);
                setMessage("Von der Widget-App abgemeldet.", false);
                WidgetUpdater.refreshAsync(this);
            });
        });
    }

    private void showSessionState(boolean signedIn) {
        loginForm.setVisibility(signedIn ? View.GONE : View.VISIBLE);
        accountPanel.setVisibility(signedIn ? View.VISIBLE : View.GONE);
    }

    private void setBusy(boolean busy) {
        loginButton.setEnabled(!busy);
        updateButton.setEnabled(!busy);
        logoutButton.setEnabled(!busy);
    }

    private void setMessage(String text, boolean isError) {
        message.setText(text);
        message.setTextColor(Color.parseColor(isError ? "#8A2D2D" : "#315E4B"));
    }

    private static String humanMessage(Exception error) {
        String detail = error.getMessage();
        if (error instanceof SupabaseApi.ApiException
            && ((SupabaseApi.ApiException) error).statusCode == 400) {
            return "Anmeldung fehlgeschlagen: E-Mail oder Passwort nicht korrekt.";
        }
        if (detail == null || detail.trim().isEmpty()) return "Anmeldung fehlgeschlagen. Bitte erneut versuchen.";
        return "Anmeldung fehlgeschlagen: " + detail;
    }
}
