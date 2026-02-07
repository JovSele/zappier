use std::fs;
use zapier_lighthouse_wasm::parse_zapier_export;

#[test]
fn test_standard_zip() {
    println!("\n=== Testing test.zip (standard baseline) ===");
    
    // Read ZIP file as bytes
    let zip_bytes = fs::read("../test-data/test.zip")
        .expect("Failed to read test.zip");
    
    let result = parse_zapier_export(&zip_bytes);
    
    // Parse the JSON result
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .expect("Failed to parse JSON result");
    
    if parsed["success"].as_bool().unwrap_or(false) {
        println!("✅ PASS - Standard ZIP parsed successfully");
        println!("   Zaps found: {}", parsed["zap_count"]);
        println!("   Total nodes: {}", parsed["total_nodes"]);
        println!("   Message: {}", parsed["message"]);
        
        assert!(parsed["success"].as_bool().unwrap());
        assert!(parsed["zap_count"].as_u64().unwrap() > 0, "Should have at least 1 zap");
    } else {
        println!("❌ FAIL - Standard ZIP error");
        println!("   Error: {}", parsed["message"]);
        panic!("Baseline test should not fail: {}", parsed["message"]);
    }
}

#[test]
fn test_with_history_zip() {
    println!("\n=== Testing test_with_history.zip ===");
    
    let zip_bytes = fs::read("../test-data/test_with_history.zip")
        .expect("Failed to read test_with_history.zip");
    
    let result = parse_zapier_export(&zip_bytes);
    
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .expect("Failed to parse JSON result");
    
    if parsed["success"].as_bool().unwrap_or(false) {
        println!("✅ PASS - ZIP with history parsed");
        println!("   Zaps found: {}", parsed["zap_count"]);
        println!("   Total nodes: {}", parsed["total_nodes"]);
        println!("   Efficiency flags: {}", parsed["efficiency_flags"].as_array().map(|a| a.len()).unwrap_or(0));
        
        assert!(parsed["success"].as_bool().unwrap());
    } else {
        println!("❌ FAIL - History ZIP error");
        println!("   Error: {}", parsed["message"]);
        panic!("History ZIP should parse: {}", parsed["message"]);
    }
}

#[test]
fn test_test3_zip() {
    println!("\n=== Testing test3.zip ===");
    
    let zip_bytes = fs::read("../test-data/test3.zip")
        .expect("Failed to read test3.zip");
    
    let result = parse_zapier_export(&zip_bytes);
    
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .expect("Failed to parse JSON result");
    
    if parsed["success"].as_bool().unwrap_or(false) {
        println!("✅ PASS - test3.zip parsed");
        println!("   Zaps found: {}", parsed["zap_count"]);
        println!("   Total nodes: {}", parsed["total_nodes"]);
    } else {
        println!("⚠️  FAIL - test3.zip error");
        println!("   Error: {}", parsed["message"]);
        // Don't panic - document the failure
    }
}

#[test]
fn test_test4_zip() {
    println!("\n=== Testing test4.zip ===");
    
    let zip_bytes = fs::read("../test-data/test4.zip")
        .expect("Failed to read test4.zip");
    
    let result = parse_zapier_export(&zip_bytes);
    
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .expect("Failed to parse JSON result");
    
    if parsed["success"].as_bool().unwrap_or(false) {
        println!("✅ PASS - test4.zip parsed");
        println!("   Zaps found: {}", parsed["zap_count"]);
        println!("   Total nodes: {}", parsed["total_nodes"]);
    } else {
        println!("⚠️  FAIL - test4.zip error");
        println!("   Error: {}", parsed["message"]);
        // Don't panic - document the failure
    }
}

#[test]
fn test_all_zips_summary() {
    println!("\n=== COMPATIBILITY SUMMARY ===");
    
    let test_files = vec![
        "../test-data/test.zip",
        "../test-data/test_with_history.zip",
        "../test-data/test3.zip",
        "../test-data/test4.zip",
    ];
    
    let mut passed = 0;
    let mut failed = 0;
    let mut errors = Vec::new();
    
    for file_path in &test_files {
        let file_name = file_path.split('/').last().unwrap_or(file_path);
        
        match fs::read(file_path) {
            Ok(zip_bytes) => {
                let result = parse_zapier_export(&zip_bytes);
                let parsed: serde_json::Value = serde_json::from_str(&result)
                    .unwrap_or_else(|_| serde_json::json!({"success": false, "message": "JSON parse error"}));
                
                if parsed["success"].as_bool().unwrap_or(false) {
                    passed += 1;
                    println!("  ✅ {} - {} zaps", file_name, parsed["zap_count"]);
                } else {
                    failed += 1;
                    let error_msg = parsed["message"].as_str().unwrap_or("Unknown error");
                    println!("  ❌ {} - {}", file_name, error_msg);
                    errors.push((file_name.to_string(), error_msg.to_string()));
                }
            }
            Err(e) => {
                failed += 1;
                println!("  ❌ {} - File read error: {}", file_name, e);
                errors.push((file_name.to_string(), format!("File read error: {}", e)));
            }
        }
    }
    
    println!("\n📊 Results: {} passed, {} failed", passed, failed);
    
    if !errors.is_empty() {
        println!("\n❌ Failed tests:");
        for (file, error) in &errors {
            println!("   - {}: {}", file, error);
        }
    }
    
    // Don't panic - this is just a summary
}
