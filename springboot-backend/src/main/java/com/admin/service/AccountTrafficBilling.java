package com.admin.service;

import com.admin.common.dto.FlowDto;
import com.admin.entity.User;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;

/** Atomic billing using the account policy at report time, with persistent fractional bytes. */
public final class AccountTrafficBilling {
    private AccountTrafficBilling() {}

    public static void addUsage(UpdateWrapper<User> update, FlowDto stats) {
        long download = delta(stats.getD()), upload = delta(stats.getU());
        addDirection(update, "in_flow", "billing_download_remainder", "download", download);
        addDirection(update, "out_flow", "billing_upload_remainder", "upload", upload);
    }

    private static long delta(Long bytes) {
        if (bytes == null || bytes < 0) throw new IllegalArgumentException("Traffic deltas must be non-negative");
        return bytes;
    }

    private static void addDirection(UpdateWrapper<User> update, String counter, String remainder, String mode, long bytes) {
        // SQL literals contain only validated numeric deltas. Modes/column names are internal constants.
        // MySQL evaluates single-table SET assignments left to right: consume the old remainder first.
        String total = "(" + remainder + " + CASE WHEN billing_mode IN ('both','" + mode
                + "') THEN CAST(" + bytes + " AS DECIMAL(30,0)) * traffic_multiplier ELSE 0 END)";
        update.setSql(counter + " = " + counter + " + FLOOR(" + total + ")");
        update.setSql(remainder + " = MOD(" + total + ", 1)");
    }
}
