<?php
/**
 * Plugin Name: CU Portal Badge Bridge (Pilot)
 * Description: Authenticated learner badges, original signed downloads and learner-controlled sharing.
 * Version: 0.4.3
 */
defined('ABSPATH') || exit;

// Provision external_learner_id on the WordPress user; keep the portal token server-side.
function cu_badge_current_learner() {
    if (!is_user_logged_in()) return new WP_Error('cu_badge_login', 'Sign in to view your badges.', array('status' => 401));
    $learner = get_user_meta(get_current_user_id(), 'external_learner_id', true);
    if (!is_string($learner) || $learner === '' || strlen($learner) > 200) return new WP_Error('cu_badge_mapping', 'Your badge account has not been linked. Contact portal support.', array('status' => 403));
    return $learner;
}
function cu_badge_request($path, $body = null) {
    if (!defined('CU_BADGE_SERVICE_URL') || !defined('CU_BADGE_PORTAL_TOKEN')) return new WP_Error('cu_badge_unconfigured', 'The badge service is not connected.', array('status' => 503));
    $url = rtrim(CU_BADGE_SERVICE_URL, '/');
    $host = wp_parse_url($url, PHP_URL_HOST);
    $scheme = wp_parse_url($url, PHP_URL_SCHEME);
    if ($scheme !== 'https' && !($scheme === 'http' && in_array($host, array('127.0.0.1', 'localhost'), true))) return new WP_Error('cu_badge_connection', 'Badge connection requires HTTPS.', array('status' => 503));
    $args = array('timeout' => 15, 'redirection' => 0, 'method' => $body === null ? 'GET' : 'POST', 'headers' => array('Authorization' => 'Bearer ' . CU_BADGE_PORTAL_TOKEN));
    if ($body !== null) { $args['headers']['Content-Type'] = 'application/json'; $args['body'] = wp_json_encode($body); }
    $response = wp_remote_request($url . $path, $args);
    if (is_wp_error($response)) return new WP_Error('cu_badge_unavailable', 'Badges are temporarily unavailable. Please try again.', array('status' => 503));
    $status = wp_remote_retrieve_response_code($response);
    if ($status !== 200) return new WP_Error('cu_badge_unavailable', $status === 404 ? 'This badge is unavailable for your account.' : ($status === 400 ? 'This sharing change could not be applied. Refresh your badges and try again.' : 'Badges are temporarily unavailable. Please try again.'), array('status' => $status === 404 ? 404 : ($status === 400 ? 400 : 503)));
    $data = json_decode(wp_remote_retrieve_body($response), true);
    if (!is_array($data)) return new WP_Error('cu_badge_invalid', 'The badge service returned an unreadable response.', array('status' => 503));
    return $data;
}
function cu_badge_current_awards() {
    $learner = cu_badge_current_learner(); if (is_wp_error($learner)) return $learner;
    $data = cu_badge_request('/api/learners/' . rawurlencode($learner) . '/badges');
    if (is_wp_error($data)) return $data;
    if (!isset($data['badges']) || !is_array($data['badges'])) return new WP_Error('cu_badge_invalid', 'Badges are temporarily unavailable.', array('status' => 503));
    return $data;
}
function cu_badge_private_response($data) {
    if (is_wp_error($data)) return $data;
    $response = new WP_REST_Response($data);
    $response->header('Cache-Control', 'private, no-store, max-age=0');
    $response->header('X-Content-Type-Options', 'nosniff');
    return $response;
}
add_action('rest_api_init', function() {
    $permission = function() { return is_user_logged_in() ? true : new WP_Error('cu_badge_login', 'Sign in to view your badges.', array('status' => 401)); };
    register_rest_route('cu-badges/v1', '/badges', array('methods' => 'GET', 'permission_callback' => $permission, 'callback' => function() { return cu_badge_private_response(cu_badge_current_awards()); }));
    $route = '/badges/(?P<source>[a-z0-9-]+)/(?P<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
    register_rest_route('cu-badges/v1', $route . '/download', array('methods' => 'GET', 'permission_callback' => $permission, 'callback' => function($request) {
        $learner = cu_badge_current_learner(); if (is_wp_error($learner)) return $learner;
        return cu_badge_private_response(cu_badge_request('/api/learners/' . rawurlencode($learner) . '/badges/' . rawurlencode($request['source']) . '/' . rawurlencode($request['id']) . '/download'));
    }));
    register_rest_route('cu-badges/v1', $route . '/sharing', array('methods' => 'POST', 'permission_callback' => $permission, 'callback' => function($request) {
        $learner = cu_badge_current_learner(); if (is_wp_error($learner)) return $learner;
        $body = $request->get_json_params();
        if (!is_array($body) || !isset($body['shared']) || !is_bool($body['shared'])) return new WP_Error('cu_badge_invalid_sharing', 'Choose whether to enable sharing.', array('status' => 400));
        return cu_badge_private_response(cu_badge_request('/api/learners/' . rawurlencode($learner) . '/badges/' . rawurlencode($request['source']) . '/' . rawurlencode($request['id']) . '/sharing', array('shared' => $body['shared'])));
    }));
});
add_shortcode('cu_my_badges', function() {
    $login = wp_login_url(home_url('/my-badges/'));
    $view = file_get_contents(__DIR__ . '/view.html');
    $view = str_replace('href="http://127.0.0.1:9400/my-badges/"', 'href="' . esc_url($login) . '"', $view);
    if (is_user_logged_in()) {
        $user = wp_get_current_user();
        $view = str_replace('<a id="cu-signout" hidden>', '<a id="cu-signout" href="' . esc_url(wp_logout_url(home_url('/my-badges/'))) . '">', $view);
        $view = str_replace('<p class="cu-intro">', '<p class="cu-account">Signed in as ' . esc_html($user->display_name) . '</p><p class="cu-intro">', $view);
    }
    $view = str_replace('Open the CU Portal</a>', 'Sign in to the CU Portal</a>', $view);
    return '<main class="cu-badges" data-api="' . esc_url(rest_url('cu-badges/v1')) . '" data-mode="portal" data-nonce="' . esc_attr(wp_create_nonce('wp_rest')) . '">' . $view . '<noscript><p>Enable JavaScript to view your badges and manage sharing.</p></noscript></main>';
});
add_action('wp_enqueue_scripts', function() {
    global $post;
    if (!is_page('my-badges') && (!$post || !has_shortcode($post->post_content, 'cu_my_badges'))) return;
    wp_enqueue_style('cu-my-badges', plugins_url('assets/my-badges.css', __FILE__), array(), filemtime(__DIR__.'/assets/my-badges.css'));
    wp_enqueue_script('cu-my-badges', plugins_url('assets/my-badges.js', __FILE__), array(), filemtime(__DIR__.'/assets/my-badges.js'), true);
});
// Never cache personalised pages (also exclude the page and REST namespace in an edge/page cache).
add_action('template_redirect', function() {
    global $post;
    if (is_page('my-badges') || ($post && has_shortcode($post->post_content, 'cu_my_badges'))) { if (!defined('DONOTCACHEPAGE')) define('DONOTCACHEPAGE', true); show_admin_bar(false); nocache_headers(); }
}, -1);
// Self-contained local portal route; use the existing CE portal shell when installed.
add_action('template_redirect', function() {
    if (!is_page('my-badges') || function_exists('ce_portal_sample_render_sample_route')) return;
    ?><!doctype html><html <?php language_attributes(); ?>><head><meta charset="<?php bloginfo('charset'); ?>"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My Badges | CU Portal</title><?php wp_head(); ?></head><body><header class="cu-header"><a class="cu-brand" href="<?php echo esc_url(home_url('/')); ?>">CU <span>PORTAL</span></a><nav aria-label="Learner navigation"><?php if (get_page_by_path('my-learning')): ?><a href="<?php echo esc_url(home_url('/my-learning/')); ?>">My Learning</a><?php endif; ?><a aria-current="page" href="<?php echo esc_url(home_url('/my-badges/')); ?>">My Badges</a><?php if(cu_badge_can_award()): ?><a href="<?php echo esc_url(home_url('/award-badges/')); ?>">Award Badges</a><a href="<?php echo esc_url(home_url('/certificates/')); ?>">Certificates</a><?php endif; ?></nav><?php if (defined('CU_BADGE_LOCAL_PREVIEW') && CU_BADGE_LOCAL_PREVIEW): ?><span class="cu-local">LOCAL PORTAL PILOT</span><?php endif; ?></header><?php echo do_shortcode('[cu_my_badges]'); wp_footer(); ?></body></html><?php exit;
}, 1);


// Award authority is separate from learner read/sharing authority. No token is sent to JavaScript.
function cu_badge_can_award() {
    return is_user_logged_in() && (current_user_can('cu_award_badges') || current_user_can('manage_options'));
}
function cu_badge_staff_request($path, $body = null, $csv = false, $resource = 'awards') {
    if (!cu_badge_can_award()) return new WP_Error('cu_badge_staff', 'Badge issuer permission is required.', array('status'=>403));
    if (!defined('CU_BADGE_SERVICE_URL') || !defined('CU_BADGE_AWARD_TOKEN')) return new WP_Error('cu_badge_staff_config', 'Staff awarding is not connected. Contact the portal administrator.', array('status'=>503));
    $base = rtrim(CU_BADGE_SERVICE_URL, '/'); $scheme=wp_parse_url($base,PHP_URL_SCHEME); $host=wp_parse_url($base,PHP_URL_HOST);
    if ($scheme !== 'https' && !($scheme === 'http' && in_array($host,array('127.0.0.1','localhost'),true))) return new WP_Error('cu_badge_staff_config','Badge connection requires HTTPS.',array('status'=>503));
    $args=array('timeout'=>45,'redirection'=>0,'method'=>$body===null?'GET':'POST','headers'=>array('Authorization'=>'Bearer '.CU_BADGE_AWARD_TOKEN,'X-CU-Staff-Id'=>'wp:'.get_current_user_id()));
    if($body!==null){$args['headers']['Content-Type']='application/json';$args['body']=wp_json_encode($body);}
    $response=wp_remote_request($base.'/api/portal-staff/'.($resource==='certificates'?'certificates':'awards').'/'.$path,$args);
    if(is_wp_error($response))return new WP_Error('cu_badge_staff_unavailable','The award service is temporarily unavailable. Reopen the batch before retrying.',array('status'=>503));
    $status=wp_remote_retrieve_response_code($response);$text=wp_remote_retrieve_body($response);
    if($status!==200){$data=json_decode($text,true);return new WP_Error('cu_badge_staff_request',$status===400&&isset($data['error'])?sanitize_text_field($data['error']):'The award request could not be completed.',array('status'=>$status===400?400:503));}
    if($csv)return array('csv'=>$text);
    $data=json_decode($text,true);if(!is_array($data))return new WP_Error('cu_badge_staff_invalid','The award service returned an unreadable response.',array('status'=>503));
    return $data;
}
add_action('rest_api_init',function(){
    $permission=function(){return cu_badge_can_award()?true:new WP_Error('cu_badge_staff','Badge issuer permission is required.',array('status'=>is_user_logged_in()?403:401));};
    foreach(array('catalog','history','template.csv') as $path){
        register_rest_route('cu-badges/v1','/staff/awards/'.preg_quote($path,'/'),array('methods'=>'GET','permission_callback'=>$permission,'callback'=>function()use($path){return cu_badge_private_response(cu_badge_staff_request($path,null,$path==='template.csv'));}));
    }
    register_rest_route('cu-badges/v1','/staff/awards/preview',array('methods'=>'POST','permission_callback'=>$permission,'callback'=>function($request){
        $body=$request->get_json_params();if(!is_array($body))return new WP_Error('cu_badge_staff_body','A JSON object is required.',array('status'=>400));
        // Actor, permission and badge selection are checked on the server. Ignore submitted actor fields.
        $allowed=array_intersect_key($body,array_flip(array('method','versionId','learner','reason','evidenceUrl','csv','certificateTemplateId','recipientName')));
        return cu_badge_private_response(cu_badge_staff_request('preview',$allowed));
    }));
    $batch='/staff/awards/(?P<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
    register_rest_route('cu-badges/v1',$batch,array('methods'=>'GET','permission_callback'=>$permission,'callback'=>function($request){return cu_badge_private_response(cu_badge_staff_request($request['id']));}));
    register_rest_route('cu-badges/v1',$batch.'/report\.csv',array('methods'=>'GET','permission_callback'=>$permission,'callback'=>function($request){return cu_badge_private_response(cu_badge_staff_request($request['id'].'/report.csv',null,true));}));
    register_rest_route('cu-badges/v1',$batch.'/commit',array('methods'=>'POST','permission_callback'=>$permission,'callback'=>function($request){$body=$request->get_json_params();return cu_badge_private_response(cu_badge_staff_request($request['id'].'/commit',array('confirmed'=>is_array($body)&&isset($body['confirmed'])&&$body['confirmed']===true)));}));
});
add_shortcode('cu_award_badges',function(){
    if(!cu_badge_can_award())return '<main class="cu-awards"><h1>Award badges</h1><p>Sign in with a badge issuer account to award badges.</p><a href="'.esc_url(wp_login_url(home_url('/award-badges/'))).'">Staff sign in</a></main>';
    return '<main class="cu-awards" data-api="'.esc_url(rest_url('cu-badges/v1/staff/awards')).'" data-mode="portal" data-nonce="'.esc_attr(wp_create_nonce('wp_rest')).'">'.str_replace('href="/my-badges/"','href="'.esc_url(home_url('/my-badges/')).'"',file_get_contents(__DIR__.'/awards-view.html')).'</main>';
});
add_action('wp_enqueue_scripts',function(){global $post;if(!is_page('award-badges')&&(!$post||!has_shortcode($post->post_content,'cu_award_badges')))return;
    wp_enqueue_style('cu-awards',plugins_url('assets/awards.css',__FILE__),array(),filemtime(__DIR__.'/assets/awards.css'));
    if(cu_badge_can_award())wp_enqueue_script('cu-awards',plugins_url('assets/awards.js',__FILE__),array(),filemtime(__DIR__.'/assets/awards.js'),true);
});
add_action('template_redirect',function(){global $post;if(is_page('award-badges')||($post&&has_shortcode($post->post_content,'cu_award_badges'))){if(!defined('DONOTCACHEPAGE'))define('DONOTCACHEPAGE',true);show_admin_bar(false);nocache_headers();}},-1);
add_action('template_redirect',function(){
    if(!is_page('award-badges'))return;
    ?><!doctype html><html <?php language_attributes(); ?>><head><meta charset="<?php bloginfo('charset'); ?>"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Award badges | CU Portal</title><?php wp_head(); ?></head><body><header class="ca-shell"><a class="ca-brand" href="<?php echo esc_url(home_url('/')); ?>">CU <span>PORTAL</span></a><nav aria-label="Portal navigation"><a href="<?php echo esc_url(home_url('/my-badges/')); ?>">My Badges</a><a aria-current="page" href="<?php echo esc_url(home_url('/award-badges/')); ?>">Award Badges</a><a href="<?php echo esc_url(home_url('/certificates/')); ?>">Certificates</a><?php if(is_user_logged_in()): ?><a href="<?php echo esc_url(wp_logout_url(home_url('/award-badges/'))); ?>">Sign out</a><?php endif; ?></nav></header><?php echo do_shortcode('[cu_award_badges]'); wp_footer(); ?></body></html><?php exit;
},1);

// Certificate routes reuse staff capabilities and keep PDF payloads behind authenticated REST.
add_action('rest_api_init',function(){
    $staff=function(){return cu_badge_can_award()?true:new WP_Error('cu_badge_staff','Badge issuer permission is required.',array('status'=>is_user_logged_in()?403:401));};
    register_rest_route('cu-badges/v1','/staff/certificates/catalog',array('methods'=>'GET','permission_callback'=>$staff,'callback'=>function(){return cu_badge_private_response(cu_badge_staff_request('catalog',null,false,'certificates'));}));
    foreach(array('templates'=>array('id','revision','name','design'),'preview'=>array('design','recipientName','sourceId','badgeId'),'create'=>array('sourceId','badgeId','templateId','recipientName','confirmed')) as $path=>$fields){
        register_rest_route('cu-badges/v1','/staff/certificates/'.$path,array('methods'=>'POST','permission_callback'=>$staff,'callback'=>function($request)use($path,$fields){$body=$request->get_json_params();if(!is_array($body))return new WP_Error('cu_certificate_body','A JSON object is required.',array('status'=>400));return cu_badge_private_response(cu_badge_staff_request($path,array_intersect_key($body,array_flip($fields)),false,'certificates'));}));
    }
    register_rest_route('cu-badges/v1','/staff/certificates/pdf/(?P<source>[a-z0-9-]+)/(?P<id>[0-9a-f-]{36})',array('methods'=>'GET','permission_callback'=>$staff,'callback'=>function($request){return cu_badge_private_response(cu_badge_staff_request('pdf/'.$request['source'].'/'.$request['id'],null,false,'certificates'));}));
    register_rest_route('cu-badges/v1','/badges/(?P<source>[a-z0-9-]+)/(?P<id>[0-9a-f-]{36})/certificate',array('methods'=>'GET','permission_callback'=>function(){return is_user_logged_in()?true:new WP_Error('cu_badge_login','Sign in to download your certificate.',array('status'=>401));},'callback'=>function($request){$learner=cu_badge_current_learner();if(is_wp_error($learner))return $learner;return cu_badge_private_response(cu_badge_request('/api/learners/'.rawurlencode($learner).'/badges/'.$request['source'].'/'.$request['id'].'/certificate'));}));
});
add_shortcode('cu_certificates',function(){
    if(!cu_badge_can_award())return '<main class="cu-awards"><h1>Certificates</h1><p>Sign in with a badge issuer account to create certificates.</p><a href="'.esc_url(wp_login_url(home_url('/certificates/'))).'">Staff sign in</a></main>';
    return '<main class="cu-awards cu-certificates" data-api="'.esc_url(rest_url('cu-badges/v1/staff/certificates')).'" data-mode="portal" data-nonce="'.esc_attr(wp_create_nonce('wp_rest')).'">'.str_replace(array('href="/award-badges/"'),array('href="'.esc_url(home_url('/award-badges/')).'"'),file_get_contents(__DIR__.'/certificates-view.html')).'</main>';
});
add_action('wp_enqueue_scripts',function(){global $post;if(!is_page('certificates')&&(!$post||!has_shortcode($post->post_content,'cu_certificates')))return;
    wp_enqueue_style('cu-awards',plugins_url('assets/awards.css',__FILE__),array(),filemtime(__DIR__.'/assets/awards.css'));
    wp_enqueue_style('cu-certificates',plugins_url('assets/certificates.css',__FILE__),array('cu-awards'),filemtime(__DIR__.'/assets/certificates.css'));
    if(cu_badge_can_award())wp_enqueue_script('cu-certificates',plugins_url('assets/certificates.js',__FILE__),array(),filemtime(__DIR__.'/assets/certificates.js'),true);
});
add_action('template_redirect',function(){global $post;if(is_page('certificates')||($post&&has_shortcode($post->post_content,'cu_certificates'))){if(!defined('DONOTCACHEPAGE'))define('DONOTCACHEPAGE',true);show_admin_bar(false);nocache_headers();}},-1);
add_action('template_redirect',function(){if(!is_page('certificates'))return;
?><!doctype html><html <?php language_attributes(); ?>><head><meta charset="<?php bloginfo('charset'); ?>"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Certificates | CU Portal</title><?php wp_head(); ?></head><body><header class="ca-shell"><a class="ca-brand" href="<?php echo esc_url(home_url('/')); ?>">CU <span>PORTAL</span></a><nav aria-label="Portal navigation"><a href="<?php echo esc_url(home_url('/my-badges/')); ?>">My Badges</a><a href="<?php echo esc_url(home_url('/award-badges/')); ?>">Award Badges</a><a aria-current="page" href="<?php echo esc_url(home_url('/certificates/')); ?>">Certificates</a><?php if(is_user_logged_in()): ?><a href="<?php echo esc_url(wp_logout_url(home_url('/certificates/'))); ?>">Sign out</a><?php endif; ?></nav></header><?php echo do_shortcode('[cu_certificates]'); wp_footer(); ?></body></html><?php exit;
},1);
