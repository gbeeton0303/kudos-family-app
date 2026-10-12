import { useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../cloud/AuthContext';
import { normalizeChildUsername, validateChildPassword } from '../cloud/childIdentity';
import { ChildLoginSessionError } from '../cloud/completeChildLoginSetup';
import { FieldError } from '../components/FieldError';
import { hasFieldErrors, validateChildLoginFields } from '../forms/authValidation';

export function ChildLoginSetupScreen({ onSkip }: { onSkip: () => void }) {
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);
  const [validationShown, setValidationShown] = useState(false);
  const errors = validationShown ? validateChildLoginFields(username, password, confirmation) : {};
  const save = async () => {
    if (running.current) return;
    setValidationShown(true);
    if (hasFieldErrors(validateChildLoginFields(username, password, confirmation))) return;
    Keyboard.dismiss();
    running.current = true; setBusy(true);
    try {
      const normalized = normalizeChildUsername(username);
      validateChildPassword(password);
      if (password !== confirmation) throw new Error('The passwords do not match.');
      await auth.setupChildLogin(normalized, password);
      setPassword(''); setConfirmation('');
      onSkip();
    } catch (error) {
      if (error instanceof ChildLoginSessionError) {
        setPassword(''); setConfirmation('');
        Alert.alert('Login Saved', error.message, [{ text: 'Continue', onPress: onSkip }]);
      } else Alert.alert('Could Not Save Login', error instanceof Error ? error.message : String(error));
    }
    finally { running.current = false; setBusy(false); }
  };
  return <SafeAreaView style={styles.root}><KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.card}>
      <Text style={styles.title}>Your profile is connected!</Text><Text style={styles.help}>Choose a login so you can get back in without another code. No email needed.</Text>
      <Text style={styles.label}>Choose a username</Text><TextInput accessibilityLabel="Child username" editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={24} value={username} onChangeText={setUsername} placeholder="e.g. happy_star27" style={styles.input} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} />
      <FieldError message={errors.username} />
      <Text style={styles.help}>4–24 letters, numbers, or underscores. Start with a letter. Pick a nickname, not your full name.</Text>
      <Text style={styles.label}>Password</Text><TextInput ref={passwordRef} accessibilityLabel="Child password" editable={!busy} autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} maxLength={128} value={password} onChangeText={setPassword} placeholder="At least 8 characters" style={styles.input} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmationRef.current?.focus()} />
      <FieldError message={errors.password} />
      <TextInput ref={confirmationRef} accessibilityLabel="Confirm child password" editable={!busy} autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} maxLength={128} value={confirmation} onChangeText={setConfirmation} placeholder="Confirm password" style={styles.input} returnKeyType="go" submitBehavior="submit" onSubmitEditing={() => void save()} />
      <FieldError message={errors.confirmation} />
      <Pressable disabled={busy} onPress={() => setVisible(!visible)} style={styles.linkButton}><Text style={styles.link}>{visible ? 'Hide' : 'Show'} passwords</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void save()} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save My Login'}</Text></Pressable>
      <Text style={styles.help}>Forgot it later? Your parent can reset your login in Settings → Account.</Text>
      <Pressable disabled={busy} onPress={onSkip} style={styles.linkButton}><Text style={styles.link}>Not now — continue to my profile</Text></Pressable>
    </View></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ root:{ flex:1,backgroundColor:'#EAF6F2' },content:{ flexGrow:1,justifyContent:'center',alignItems:'center',padding:22 },card:{ width:'100%',maxWidth:480,borderRadius:28,backgroundColor:'#FFFFFF',padding:24,gap:12,borderWidth:1,borderColor:'#D5E9E4' },art:{ width:90,height:90,alignSelf:'center' },title:{ fontSize:25,fontWeight:'900',color:'#183437',textAlign:'center' },help:{ fontSize:13,lineHeight:20,color:'#5F7475' },label:{ color:'#183437',fontSize:13,fontWeight:'800' },input:{ backgroundColor:'#F4FBF8',borderColor:'#D5E9E4',borderWidth:1,borderRadius:14,paddingHorizontal:14,minHeight:52,color:'#183437' },button:{ backgroundColor:'#0B756F',borderRadius:16,padding:17,alignItems:'center' },buttonText:{ color:'#FFFFFF',fontWeight:'900' },linkButton:{ minHeight:44,justifyContent:'center' },link:{ color:'#0B756F',fontWeight:'800',textAlign:'center',fontSize:13 },disabled:{ opacity:0.5 } });
