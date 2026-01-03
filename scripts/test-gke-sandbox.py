#!/usr/bin/env python3
"""
Test script for GKE Agent Sandbox verification.

Tests:
1. Basic code execution
2. Network access (can we reach external URLs?)
3. Python package availability
"""

from agentic_sandbox import SandboxClient

def test_basic_execution():
    """Test basic code execution"""
    print("Test 1: Basic code execution...")
    with SandboxClient(
        template_name="python-runtime-template",
        namespace="default"
    ) as sandbox:
        result = sandbox.run("echo 'Hello from GKE Agent Sandbox!'")
        print(f"  stdout: {result.stdout.strip()}")
        print(f"  exit_code: {result.return_code}")
        assert result.return_code == 0
        assert "Hello" in result.stdout
    print("  ✓ PASSED\n")

def test_python_execution():
    """Test Python code execution"""
    print("Test 2: Python code execution...")
    with SandboxClient(
        template_name="python-runtime-template",
        namespace="default"
    ) as sandbox:
        result = sandbox.run("python3 -c \"print(2 + 2)\"")
        print(f"  stdout: {result.stdout.strip()}")
        print(f"  exit_code: {result.return_code}")
        assert result.return_code == 0
        assert "4" in result.stdout
    print("  ✓ PASSED\n")

def test_network_access():
    """Test network access - critical for MCP tools"""
    print("Test 3: Network access (curl to httpbin)...")
    with SandboxClient(
        template_name="python-runtime-template",
        namespace="default"
    ) as sandbox:
        # Try to reach an external endpoint
        result = sandbox.run("curl -s -o /dev/null -w '%{http_code}' https://httpbin.org/get --max-time 10")
        print(f"  HTTP status: {result.stdout.strip()}")
        print(f"  exit_code: {result.return_code}")
        has_network = result.return_code == 0 and "200" in result.stdout
        if has_network:
            print("  ✓ PASSED - Network access ENABLED\n")
        else:
            print("  ✗ FAILED - Network access BLOCKED\n")
        return has_network

def test_python_requests():
    """Test Python requests library for HTTP calls"""
    print("Test 4: Python requests library...")
    with SandboxClient(
        template_name="python-runtime-template",
        namespace="default"
    ) as sandbox:
        code = '''
import requests
try:
    r = requests.get("https://httpbin.org/get", timeout=10)
    print(f"status: {r.status_code}")
except Exception as e:
    print(f"error: {e}")
'''
        result = sandbox.run(f"python3 -c '{code}'")
        print(f"  stdout: {result.stdout.strip()}")
        print(f"  stderr: {result.stderr.strip() if result.stderr else 'none'}")
        if "status: 200" in result.stdout:
            print("  ✓ PASSED - requests library works\n")
            return True
        else:
            print("  ✗ FAILED\n")
            return False

if __name__ == "__main__":
    print("=" * 60)
    print("GKE Agent Sandbox Verification Tests")
    print("=" * 60 + "\n")
    
    try:
        test_basic_execution()
        test_python_execution()
        has_network = test_network_access()
        if has_network:
            test_python_requests()
        
        print("=" * 60)
        print("SUMMARY:")
        print(f"  Network Access: {'✓ ENABLED' if has_network else '✗ BLOCKED'}")
        print("=" * 60)
        
    except Exception as e:
        print(f"ERROR: {e}")
        raise

