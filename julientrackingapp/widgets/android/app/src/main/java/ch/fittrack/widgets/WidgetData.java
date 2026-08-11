package ch.fittrack.widgets;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class WidgetData {
    private static final int DEFAULT_CALORIE_GOAL = 2200;
    private static final double DEFAULT_PROTEIN_GOAL = 150;
    private static final int POOL_DAILY_CAP_KCAL = 250;
    private static final int POOL_VALID_DAYS = 7;

    final int calories;
    final int calorieGoal;
    final int totalAllowance;
    final int openCalories;
    final int poolAtDayStart;
    final double protein;
    final double proteinGoal;
    final double carbs;
    final Double carbsGoal;
    final double fat;
    final Double fatGoal;

    private WidgetData(
        int calories,
        int calorieGoal,
        int totalAllowance,
        int openCalories,
        int poolAtDayStart,
        double protein,
        double proteinGoal,
        double carbs,
        Double carbsGoal,
        double fat,
        Double fatGoal
    ) {
        this.calories = calories;
        this.calorieGoal = calorieGoal;
        this.totalAllowance = totalAllowance;
        this.openCalories = openCalories;
        this.poolAtDayStart = poolAtDayStart;
        this.protein = protein;
        this.proteinGoal = proteinGoal;
        this.carbs = carbs;
        this.carbsGoal = carbsGoal;
        this.fat = fat;
        this.fatGoal = fatGoal;
    }

    static WidgetData from(JSONObject settings, JSONArray foodRows) {
        JSONObject goals = settings != null ? settings.optJSONObject("goals") : null;
        JSONObject pool = settings != null ? settings.optJSONObject("pool") : null;
        int fallbackGoal = positiveOrDefault(goals, "calorie_goal_kcal", DEFAULT_CALORIE_GOAL);
        double proteinGoal = positiveOrDefault(goals, "protein_goal_g", DEFAULT_PROTEIN_GOAL);
        Double carbsGoal = optionalPositive(goals, "carbs_goal_g");
        Double fatGoal = optionalPositive(goals, "fat_goal_g");
        List<GoalHistoryEntry> goalHistory = parseGoalHistory(pool);

        Map<LocalDate, DailyTotals> totalsByDate = new HashMap<>();
        for (int index = 0; index < foodRows.length(); index++) {
            JSONObject row = foodRows.optJSONObject(index);
            if (row == null) continue;
            try {
                LocalDate date = LocalDate.parse(row.optString("date"));
                DailyTotals totals = totalsByDate.computeIfAbsent(date, ignored -> new DailyTotals());
                totals.calories += finite(row.optDouble("calories_kcal", 0));
                totals.protein += finite(row.optDouble("protein_g", 0));
                totals.carbs += finite(row.optDouble("carbs_g", 0));
                totals.fat += finite(row.optDouble("fat_g", 0));
                totals.count += 1;
            } catch (Exception ignored) {
                // Ignore malformed rows; valid daily rows still render.
            }
        }

        LocalDate today = LocalDate.now();
        DailyTotals todayTotals = totalsByDate.getOrDefault(today, new DailyTotals());
        int currentGoal = goalForDate(fallbackGoal, goalHistory, today);
        int poolAtStart = (int) Math.round(calculatePoolAtDayStart(totalsByDate, fallbackGoal, goalHistory, today));
        int roundedCalories = (int) Math.round(todayTotals.calories);
        int allowance = Math.max(currentGoal + poolAtStart, 0);

        return new WidgetData(
            roundedCalories,
            currentGoal,
            allowance,
            Math.max(allowance - roundedCalories, 0),
            poolAtStart,
            todayTotals.protein,
            proteinGoal,
            todayTotals.carbs,
            carbsGoal,
            todayTotals.fat,
            fatGoal
        );
    }

    int calorieProgressPercent() {
        if (totalAllowance <= 0) return 0;
        return (int) Math.min(Math.round(calories * 100.0 / totalAllowance), 100);
    }

    static String todayKey() {
        return LocalDate.now().toString();
    }

    static String startDateKey() {
        return LocalDate.now().minusDays(POOL_VALID_DAYS).toString();
    }

    private static double calculatePoolAtDayStart(
        Map<LocalDate, DailyTotals> totalsByDate,
        int fallbackGoal,
        List<GoalHistoryEntry> history,
        LocalDate today
    ) {
        List<PoolBucket> buckets = new ArrayList<>();
        LocalDate start = today.minusDays(POOL_VALID_DAYS);

        for (LocalDate cursor = start; !cursor.isAfter(today); cursor = cursor.plusDays(1)) {
            LocalDate date = cursor;
            buckets.removeIf(bucket -> bucket.lastUsableDate.isBefore(date) || bucket.remaining <= 0);
            if (cursor.equals(today)) return sumBuckets(buckets);

            DailyTotals totals = totalsByDate.getOrDefault(cursor, new DailyTotals());
            int goal = goalForDate(fallbackGoal, history, cursor);
            if (totals.count == 0 || goal <= 0) continue;

            double overage = Math.max(totals.calories - goal, 0);
            for (PoolBucket bucket : buckets) {
                double used = Math.min(bucket.remaining, overage);
                bucket.remaining -= used;
                overage -= used;
                if (overage == 0) break;
            }

            double credit = Math.min(Math.max(goal - totals.calories, 0), POOL_DAILY_CAP_KCAL);
            if (credit > 0) {
                buckets.add(new PoolBucket(credit, cursor.plusDays(POOL_VALID_DAYS)));
            }
        }
        return 0;
    }

    private static double sumBuckets(List<PoolBucket> buckets) {
        double sum = 0;
        for (PoolBucket bucket : buckets) sum += bucket.remaining;
        return sum;
    }

    private static int goalForDate(int fallbackGoal, List<GoalHistoryEntry> history, LocalDate date) {
        int goal = fallbackGoal;
        for (GoalHistoryEntry entry : history) {
            if (entry.effectiveDate.isAfter(date)) break;
            goal = entry.calorieGoal;
        }
        return goal;
    }

    private static List<GoalHistoryEntry> parseGoalHistory(JSONObject pool) {
        List<GoalHistoryEntry> history = new ArrayList<>();
        JSONArray rows = pool != null ? pool.optJSONArray("calorie_goal_history") : null;
        if (rows == null) return history;

        for (int index = 0; index < rows.length(); index++) {
            JSONObject row = rows.optJSONObject(index);
            if (row == null) continue;
            try {
                int goal = (int) Math.round(row.getDouble("calorie_goal_kcal"));
                if (goal >= 0) history.add(new GoalHistoryEntry(LocalDate.parse(row.getString("effective_date")), goal));
            } catch (Exception ignored) {
                // Ignore malformed legacy history entries.
            }
        }
        history.sort(Comparator.comparing(entry -> entry.effectiveDate));
        return history;
    }

    private static int positiveOrDefault(JSONObject object, String key, int fallback) {
        if (object == null || object.isNull(key)) return fallback;
        double value = finite(object.optDouble(key, fallback));
        return value >= 0 ? (int) Math.round(value) : fallback;
    }

    private static double positiveOrDefault(JSONObject object, String key, double fallback) {
        if (object == null || object.isNull(key)) return fallback;
        double value = finite(object.optDouble(key, fallback));
        return value >= 0 ? value : fallback;
    }

    private static Double optionalPositive(JSONObject object, String key) {
        if (object == null || object.isNull(key)) return null;
        double value = finite(object.optDouble(key, Double.NaN));
        return value > 0 ? value : null;
    }

    private static double finite(double value) {
        return Double.isFinite(value) ? value : 0;
    }

    private static final class DailyTotals {
        double calories;
        double protein;
        double carbs;
        double fat;
        int count;
    }

    private static final class GoalHistoryEntry {
        final LocalDate effectiveDate;
        final int calorieGoal;

        GoalHistoryEntry(LocalDate effectiveDate, int calorieGoal) {
            this.effectiveDate = effectiveDate;
            this.calorieGoal = calorieGoal;
        }
    }

    private static final class PoolBucket {
        double remaining;
        final LocalDate lastUsableDate;

        PoolBucket(double remaining, LocalDate lastUsableDate) {
            this.remaining = remaining;
            this.lastUsableDate = lastUsableDate;
        }
    }
}
