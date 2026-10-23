package com.finance.pricer;

import java.util.List;

public record Option(
        double strike,
        double maturity,
        OptionType type,
        ExerciseStyle exerciseStyle,
        List<Double> exerciseTimesYears
) implements Instrument {
    public Option {
        if (strike <= 0 || maturity <= 0 || type == null || exerciseStyle == null) {
            throw new IllegalArgumentException("Strike and maturity must be positive");
        }
        exerciseTimesYears = exerciseTimesYears == null ? List.of() : List.copyOf(exerciseTimesYears);
        if (exerciseStyle == ExerciseStyle.BERMUDAN && exerciseTimesYears.isEmpty()) {
            throw new IllegalArgumentException("Bermudan options require at least one exercise time");
        }
        if (exerciseStyle != ExerciseStyle.BERMUDAN && !exerciseTimesYears.isEmpty()) {
            throw new IllegalArgumentException("Only Bermudan options accept scheduled exercise times");
        }
        double previousTime = 0;
        for (Double exerciseTime : exerciseTimesYears) {
            if (exerciseTime == null || !Double.isFinite(exerciseTime)
                    || exerciseTime <= previousTime || exerciseTime >= maturity) {
                throw new IllegalArgumentException("Bermudan exercise times must be strictly increasing and before maturity");
            }
            previousTime = exerciseTime;
        }
    }

    public Option(double strike, double maturity, OptionType type, boolean european) {
        this(strike, maturity, type, european ? ExerciseStyle.EUROPEAN : ExerciseStyle.AMERICAN, List.of());
    }

    public static Option bermudan(double strike, double maturity, OptionType type, List<Double> exerciseTimesYears) {
        return new Option(strike, maturity, type, ExerciseStyle.BERMUDAN, exerciseTimesYears);
    }

    public boolean european() {
        return exerciseStyle == ExerciseStyle.EUROPEAN;
    }

    public boolean canExerciseAt(double time, double stepSize) {
        if (exerciseStyle == ExerciseStyle.AMERICAN) return true;
        if (exerciseStyle != ExerciseStyle.BERMUDAN) return false;
        long nodeIndex = nearestNodeIndex(time, stepSize);
        return exerciseTimesYears.stream().anyMatch(exerciseTime -> nearestNodeIndex(exerciseTime, stepSize) == nodeIndex);
    }

    private static long nearestNodeIndex(double time, double stepSize) {
        double scaledTime = time / stepSize;
        return (long) Math.floor(scaledTime + 0.5 + 2 * Math.ulp(scaledTime));
    }

    @Override
    public String instrumentType() {
        return type + " " + exerciseStyle;
    }
}
