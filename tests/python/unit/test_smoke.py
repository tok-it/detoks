from python.role1 import prompt_compiler, request_analyzer, schemas


def test_role1_modules_import() -> None:
    assert prompt_compiler is not None
    assert request_analyzer is not None
    assert schemas is not None
