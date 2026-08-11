package ch.fittrack.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

abstract class BaseGoalsWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "ch.fittrack.widgets.action.REFRESH";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        WidgetUpdater.showLoading(context, manager, appWidgetIds, getClass());
        WidgetUpdater.refreshAsync(context, goAsync());
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            WidgetUpdater.showLoadingForAll(context);
            WidgetUpdater.refreshAsync(context, goAsync());
            return;
        }
        super.onReceive(context, intent);
    }
}
