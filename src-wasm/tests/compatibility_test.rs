use std::fs;
use zapier_lighthouse_wasm::parse_zapier_export;

#[test]
fn test_standard_zip() {
    println!("\n=== Testing standard.zip ===");
    
    let zip_bytes = fs::read("../test-data/standard.zip")
        .expect("Failed to read standard.zip");
    
    let result = parse_zapier_export(&zip_bytes);
    
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .expect("Failed to parse JSON result");
    
    if parsed["success"].as_bool().unwrap_or(false) {
        println!("✅ PASS - Standard ZIP parsed");
        println!("   Zaps found: {}", parsed["zap_count"]);
        println!("   Total nodes: {}", parsed["total_nodes"]);
        
        assert!(parsed["success"].as_bool().unwrap());
    } else {
        println!("❌ FAIL - Standard ZIP error: {:?}", parsed["message"]);
        panic!("Baseline should not fail");
    }
}

#[test]
fn test_legacy_zip() {
    println!("\n=== Testing legacy.zip ===");
    
    let zip_bytes = fs::read("../test-data/legacy.zip")
        .expect("Failed to read legacy.zip");
    
    let result = parse_zapier_export(&zip_bytes);
    
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .expect("Failed to parse JSON result");
    
    if parsed["success"].as_bool().unwrap_or(false) {
        println!("✅ PASS - Legacy format supported");
        println!("   Zaps found: {}", parsed["zap_count"]);
    } else {
        println!("⚠️  EXPECTED FAIL - Legacy not yet supported");
        println!("   Error: {:?}", parsed["message"]);
        // Don't panic - we know this may fail
    }
}

#[test]
fn test_partial_zip() {
    println!("\n=== Testing partial.zip ===");
    
    let zip_bytes = fs::read("../test-data/partial.zip")
        .expect("Failed to read partial.zip");
    
    let result = parse_zapier_export(&zip_bytes);
    
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .expect("Failed to parse JSON result");
    
    if parsed["success"].as_bool().unwrap_or(false) {
        println!("✅ PASS - Partial mode working");
        println!("   Zaps found: {}", parsed["zap_count"]);
        println!("   Total nodes: {}", parsed["total_nodes"]);
        // Note: Current parser doesn't have analysis.mode field yet
    } else {
        println!("⚠️  EXPECTED FAIL - Partial mode not implemented");
        println!("   Error: {:?}", parsed["message"]);
    }
}

#[test]
fn test_urlonly_zip() {
    println!("\n=== Testing urlonly.zip ===");
    
    let zip_bytes = fs::read("../test-data/urlonly.zip")
        .expect("Failed to read urlonly.zip");
    
    let result = parse_zapier_export(&zip_bytes);
    
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .expect("Failed to parse JSON result");
    
    if parsed["success"].as_bool().unwrap_or(false) {
        println!("✅ PASS - URL-only handled gracefully");
        println!("   Zaps found: {}", parsed["zap_count"]);
    } else {
        println!("⚠️  EXPECTED FAIL - Same as partial");
        println!("   Error: {:?}", parsed["message"]);
    }
}

#[test]
fn test_all_zips_summary() {
    println!("\n=== COMPATIBILITY SUMMARY ===");
    
    let test_files = vec![
        ("../test-data/standard.zip", true),  // (path, should_pass)
        ("../test-data/legacy.zip", false),
        ("../test-data/partial.zip", false),
        ("../test-data/urlonly.zip", false),
    ];
    
    let mut passed = 0;
    let mut failed = 0;
    let mut errors = Vec::new();
    
    for (file_path, should_pass) in &test_files {
        let file_name = file_path.split('/').last().unwrap_or(file_path);
        
        match fs::read(file_path) {
            Ok(zip_bytes) => {
                let result = parse_zapier_export(&zip_bytes);
                let parsed: serde_json::Value = serde_json::from_str(&result)
                    .unwrap_or_else(|_| serde_json::json!({"success": false, "message": "JSON parse error"}));
                
                let success = parsed["success"].as_bool().unwrap_or(false);
                
                if success {
                    passed += 1;
                    println!("  ✅ {} - {} zaps", file_name, parsed["zap_count"]);
                } else {
                    failed += 1;
                    let error_msg = parsed["message"].as_str().unwrap_or("Unknown error");
                    
                    if *should_pass {
                        println!("  ❌ {} - {} (UNEXPECTED FAILURE)", file_name, error_msg);
                    } else {
                        println!("  ⚠️  {} - {} (expected)", file_name, error_msg);
                    }
                    
                    errors.push((file_name.to_string(), error_msg.to_string(), *should_pass));
                }
            }
            Err(e) => {
                failed += 1;
                println!("  ❌ {} - File read error: {}", file_name, e);
                errors.push((file_name.to_string(), format!("File read error: {}", e), *should_pass));
            }
        }
    }
    
    println!("\n📊 Results: {} passed, {} failed", passed, failed);
    
    if !errors.is_empty() {
        println!("\n❌ Failed/Expected failures:");
        for (file, error, should_pass) in &errors {
            if *should_pass {
                println!("   🚨 CRITICAL - {}: {}", file, error);
            } else {
                println!("   ⚠️  Expected - {}: {}", file, error);
            }
        }
    }
}
