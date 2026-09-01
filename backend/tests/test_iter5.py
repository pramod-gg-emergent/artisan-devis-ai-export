"""Iteration 5 - client voice capture backend tests"""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def test_parse_client_full_sentence():
    payload = {
        "transcript": "Client Jean Dupont, 12 rue Victor Hugo à Agen, téléphone 06 12 34 56 78, email jean point dupont arobase gmail point com"
    }
    r = requests.post(f"{API}/parse-client", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "Jean Dupont" in d["nom"], d
    assert "12" in d["adresse"] and "Victor Hugo" in d["adresse"] and "Agen" in d["adresse"], d
    assert re.sub(r"\s+", "", d["telephone"]) == "0612345678", d
    assert d["email"] == "jean.dupont@gmail.com", d


def test_parse_client_partial_name_only():
    r = requests.post(f"{API}/parse-client", json={"transcript": "Client Marie Curie"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "Marie" in d["nom"] and "Curie" in d["nom"], d
    # Not hallucinated
    assert d["adresse"] == "", d
    assert d["telephone"] == "", d
    assert d["email"] == "", d


def test_parse_client_empty():
    r = requests.post(f"{API}/parse-client", json={"transcript": ""}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json() == {"nom": "", "adresse": "", "telephone": "", "email": ""}


def test_parse_client_whitespace_only():
    r = requests.post(f"{API}/parse-client", json={"transcript": "   "}, timeout=30)
    assert r.status_code == 200
    assert r.json() == {"nom": "", "adresse": "", "telephone": "", "email": ""}


# Regression spot-checks
def test_seed_endpoint():
    r = requests.post(f"{API}/seed", timeout=60)
    assert r.status_code == 200, r.text


def test_quotes_list():
    r = requests.get(f"{API}/quotes", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
