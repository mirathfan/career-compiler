import io,json,pathlib,struct,tempfile,unittest
from native_host import frame,read_frame,root_for,expected_extension
class HostTests(unittest.TestCase):
    def test_roundtrip(self): self.assertEqual(read_frame(io.BytesIO(frame({'type':'ping'}))),{'type':'ping'})
    def test_oversize(self):
        with self.assertRaises(ValueError): read_frame(io.BytesIO(struct.pack('<I',2**32-1)))
    def test_truncated(self):
        with self.assertRaises(ValueError):read_frame(io.BytesIO(struct.pack('<I',10)+b'{}'))
    def test_malformed(self):
        with self.assertRaises(json.JSONDecodeError):read_frame(io.BytesIO(struct.pack('<I',1)+b'{'))
    def test_unmarked_root(self):
        with tempfile.TemporaryDirectory(prefix='careercompiler-native-') as root:
            with self.assertRaises((ValueError,FileNotFoundError)):root_for(root)
    def test_marked_root(self):
        with tempfile.TemporaryDirectory(prefix='careercompiler-native-') as root:
            path=pathlib.Path(root);(path/'ISOLATED_ACCEPTANCE').write_text('synthetic-only\n');self.assertEqual(root_for(root),path.resolve())
    def test_database_symlink(self):
        self.check_symlink('native.sqlite3')
    def test_socket_symlink(self):
        self.check_symlink('s')
    def check_symlink(self,name):
        with tempfile.TemporaryDirectory(prefix='careercompiler-native-') as root:
            path=pathlib.Path(root);(path/'ISOLATED_ACCEPTANCE').write_text('synthetic-only\n');(path/'dummy').write_text('synthetic');(path/name).symlink_to(path/'dummy')
            with self.assertRaises(ValueError):root_for(root)
    def test_missing_identity(self):
        with tempfile.TemporaryDirectory(prefix='careercompiler-native-') as root:
            with self.assertRaises(FileNotFoundError): expected_extension(pathlib.Path(root))
    def test_invalid_identity(self):
        with tempfile.TemporaryDirectory(prefix='careercompiler-native-') as root:
            path=pathlib.Path(root);(path/'TEST_EXTENSION_ID').write_text('z'*32)
            with self.assertRaises(ValueError): expected_extension(path)
    def test_valid_identity(self):
        with tempfile.TemporaryDirectory(prefix='careercompiler-native-') as root:
            path=pathlib.Path(root);(path/'TEST_EXTENSION_ID').write_text('a'*32);self.assertEqual(expected_extension(path),'a'*32)
    def test_wrong_directory(self):
        with tempfile.TemporaryDirectory(prefix='wrong-') as root:
            (pathlib.Path(root)/'ISOLATED_ACCEPTANCE').write_text('synthetic-only\n')
            with self.assertRaises(ValueError):root_for(root)
if __name__=='__main__':unittest.main()
