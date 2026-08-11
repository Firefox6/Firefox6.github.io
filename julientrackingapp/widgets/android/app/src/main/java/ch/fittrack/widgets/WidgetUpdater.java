package ch.fittrack.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class WidgetUpdater {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final NumberFormat INTEGER_FORMAT = NumberFormat.getIntegerInstance(new Locale("de", "CH"));

    private WidgetUpdater() {
    }

    static void refreshAsync(Context context, BroadcastReceiver.PendingResult pendingResult) {
        Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                WidgetData data = new SupabaseApi(appContext).loadWidgetData();
                renderAll(appContext, data, null);
            } catch (SupabaseApi.NotSignedInException error) {
                renderAll(appContext, null, error);
            } catch (Exception error) {
                renderAll(appContext, null, error);
            } finally {
                pendingResult.finish();
            }
        });
    }

    static void refreshAsync(Context context) {
        Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                WidgetData data = new SupabaseApi(appContext).loadWidgetData();
                renderAll(appContext, data, null);
            } catch (Exception error) {
                renderAll(appContext, null, error);
            }
        });
    }

    static void showLoadingForAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        showLoading(context, manager, ids(manager, context, DailyGoalsWidgetProvider.class), DailyGoalsWidgetProvider.class);
        showLoading(context, manager, ids(manager, context, CompactCaloriesWidgetProvider.class), CompactCaloriesWidgetProvider.class);
    }

    static void showLoading(
        Context context,
        AppWidgetManager manager,
        int[] appWidgetIds,
        Class<?> providerClass
    ) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = providerClass == DailyGoalsWidgetProvider.class
                ? dailyViews(context)
                : compactViews(context);
            views.setTextViewText(R.id.open_calories, "Wird geladen …");
            views.setTextViewText(R.id.calorie_summary, "Supabase wird aktualisiert");
            views.setTextViewText(R.id.protein_summary, "");
            views.setProgressBar(R.id.calorie_progress, 100, 0, true);
            bindIntents(context, views, providerClass);
            manager.updateAppWidget(appWidgetId, views);
        }
    }

    private static void renderAll(Context context, WidgetData data, Exception error) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        renderDaily(context, manager, ids(manager, context, DailyGoalsWidgetProvider.class), data, error);
        renderCompact(context, manager, ids(manager, context, CompactCaloriesWidgetProvider.class), data, error);
    }

    private static void renderDaily(
        Context context,
        AppWidgetManager manager,
        int[] appWidgetIds,
        WidgetData data,
        Exception error
    ) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = dailyViews(context);
            if (data != null) {
                views.setTextViewText(R.id.open_calories, integer(data.openCalories) + " kcal offen");
                views.setTextViewText(R.id.calorie_summary, calorieSummary(data));
                views.setTextViewText(
                    R.id.protein_summary,
                    "Protein " + decimal(data.protein) + " / " + decimal(data.proteinGoal) + " g"
                );
                views.setTextViewText(
                    R.id.macro_summary,
                    macro("KH", data.carbs, data.carbsGoal) + "  ·  " + macro("Fett", data.fat, data.fatGoal)
                );
                views.setProgressBar(R.id.calorie_progress, 100, data.calorieProgressPercent(), false);
            } else {
                renderError(views, error, true);
            }
            bindIntents(context, views, DailyGoalsWidgetProvider.class);
            manager.updateAppWidget(appWidgetId, views);
        }
    }

    private static void renderCompact(
        Context context,
        AppWidgetManager manager,
        int[] appWidgetIds,
        WidgetData data,
        Exception error
    ) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = compactViews(context);
            if (data != null) {
                views.setTextViewText(R.id.open_calories, integer(data.openCalories));
                views.setTextViewText(
                    R.id.calorie_summary,
                    "kcal offen · " + integer(data.calories) + " / " + integer(data.totalAllowance)
                );
                views.setTextViewText(
                    R.id.protein_summary,
                    "Protein " + decimal(data.protein) + " / " + decimal(data.proteinGoal) + " g"
                );
                views.setProgressBar(R.id.calorie_progress, 100, data.calorieProgressPercent(), false);
            } else {
                renderError(views, error, false);
            }
            bindIntents(context, views, CompactCaloriesWidgetProvider.class);
            manager.updateAppWidget(appWidgetId, views);
        }
    }

    private static void renderError(RemoteViews views, Exception error, boolean daily) {
        boolean signedOut = error instanceof SupabaseApi.NotSignedInException;
        views.setTextViewText(R.id.open_calories, signedOut ? "Anmelden" : "Nicht verfügbar");
        views.setTextViewText(
            R.id.calorie_summary,
            signedOut ? "Widget-App zum Einrichten öffnen" : "Zum Aktualisieren tippen"
        );
        views.setTextViewText(R.id.protein_summary, "");
        if (daily) views.setTextViewText(R.id.macro_summary, "");
        views.setProgressBar(R.id.calorie_progress, 100, 0, false);
    }

    private static RemoteViews dailyViews(Context context) {
        return new RemoteViews(context.getPackageName(), R.layout.widget_daily_goals);
    }

    private static RemoteViews compactViews(Context context) {
        return new RemoteViews(context.getPackageName(), R.layout.widget_compact_calories);
    }

    private static void bindIntents(Context context, RemoteViews views, Class<?> providerClass) {
        Intent openIntent = new Intent(context, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(
            context,
            providerClass == DailyGoalsWidgetProvider.class ? 101 : 102,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, open);

        Intent refreshIntent = new Intent(context, providerClass).setAction(BaseGoalsWidgetProvider.ACTION_REFRESH);
        PendingIntent refresh = PendingIntent.getBroadcast(
            context,
            providerClass == DailyGoalsWidgetProvider.class ? 201 : 202,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.refresh_button, refresh);
        views.setContentDescription(R.id.refresh_button, "FitTrack aktualisieren");
    }

    private static String calorieSummary(WidgetData data) {
        String summary = integer(data.calories) + " / " + integer(data.totalAllowance) + " kcal";
        if (data.poolAtDayStart > 0) summary += " · inkl. " + integer(data.poolAtDayStart) + " Pool";
        return summary;
    }

    private static String macro(String label, double value, Double goal) {
        if (goal == null) return label + " " + decimal(value) + " g";
        return label + " " + decimal(value) + " / " + decimal(goal) + " g";
    }

    private static String integer(int value) {
        synchronized (INTEGER_FORMAT) {
            return INTEGER_FORMAT.format(value);
        }
    }

    private static String decimal(double value) {
        if (Math.abs(value - Math.rint(value)) < 0.05) return integer((int) Math.round(value));
        return String.format(new Locale("de", "CH"), "%.1f", value);
    }

    private static int[] ids(AppWidgetManager manager, Context context, Class<?> providerClass) {
        return manager.getAppWidgetIds(new ComponentName(context, providerClass));
    }
}
