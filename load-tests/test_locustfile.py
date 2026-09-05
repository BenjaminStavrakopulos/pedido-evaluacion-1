import importlib.util
from pathlib import Path
import unittest


LOCUSTFILE_PATH = Path(__file__).with_name("locustfile.py")
SPEC = importlib.util.spec_from_file_location("monsite_locustfile", LOCUSTFILE_PATH)
locustfile = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(locustfile)


class FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code
        self.failure_message = None

    def failure(self, message):
        self.failure_message = message


class ValidateHealthResponseTests(unittest.TestCase):
    def test_accepts_ok_response(self):
        response = FakeResponse(200)

        locustfile.validate_health_response(response)

        self.assertIsNone(response.failure_message)

    def test_marks_non_ok_response_as_failure(self):
        response = FakeResponse(503)

        locustfile.validate_health_response(response)

        self.assertEqual(response.failure_message, "Expected 200, received 503")
