<?php
/**
 * Plugin Name: HomeoCare SureForms Booking Claims
 * Description: Server-only adapter; requires installation-specific mapping and verified mail delivery.
 */
if (!defined('ABSPATH')) { exit; }
add_action('srfm_after_submission_process', function ($form_data) {
    if (!defined('HC_FORM_ID') || !defined('HC_API_URL') || !defined('HC_FORM_SECRET') ||
        !defined('HC_APP_URL') || !defined('HC_MAIL_VERIFIED') || HC_MAIL_VERIFIED !== true) { return; }
    if ((string) ($form_data['form_id'] ?? '') !== (string) HC_FORM_ID) { return; }
    if (strpos(HC_API_URL, 'https://') !== 0 || strpos(HC_APP_URL, 'https://') !== 0) { return; }
    // Supply this filter locally using the actual SureForms field IDs/raw structure.
    $payload = apply_filters('homeocare_booking_payload', null, $form_data);
    if (!is_array($payload) || !is_email($payload['email'] ?? '')) { return; }
    $response = wp_remote_post(rtrim(HC_API_URL, '/') . '/api/public/appointment-request', [
        'timeout' => 20, 'redirection' => 0,
        'headers' => ['Content-Type' => 'application/json', 'X-Website-Form-Secret' => HC_FORM_SECRET],
        'body' => wp_json_encode($payload),
    ]);
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
        error_log('HomeoCare booking transfer failed; review the SureForms entry securely.');
        return;
    }
    $result = json_decode(wp_remote_retrieve_body($response), true);
    $token = $result['claim_token'] ?? '';
    if (!is_string($token) || !preg_match('/^[A-Za-z0-9_-]{40,100}$/', $token)) { return; }
    $link = rtrim(HC_APP_URL, '/') . '/#claim=' . rawurlencode($token);
    $sent = wp_mail($payload['email'], 'Verify your booking',
        "To link your booking, open this link and sign in with the Google account matching the email you used. Confirm ownership in the app.\n\n" .
        $link . "\n\nThis link expires in 24 hours and can be used once. If you did not request this, ignore this email.");
    if (!$sent) { error_log('HomeoCare verification email failed; contact the clinic administrator.'); }
    // Never include $result/$token in the SureForms public response or entry metadata.
}, 10, 1);
