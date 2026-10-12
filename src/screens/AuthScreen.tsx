import { useRef, useState } from 'react';
import { Alert, Image, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../cloud/AuthContext';
import { clearPendingAdultInvite, savePendingAdultInvite } from '../cloud/workspaces';
import { performAuthEntry, type AuthEntryMode } from '../cloud/authEntry';
import { createCurrentLegalAcceptance, PRIVACY_URL, TERMS_URL } from '../legal';
import { FieldError } from '../components/FieldError';
import { hasFieldErrors, validateAuthFields, validateEmail, validatePasswordConfirmation } from '../forms/authValidation';

type WelcomeScreenMode = AuthEntryMode | 'welcome' | 'adult-options' | 'child-options' | 'confirmation';

export function AuthScreen() {
  const auth = useAuth();
  const [screen, setScreen] = useState<WelcomeScreenMode>('welcome');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const inviteRef = useRef<TextInput>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [validationShown, setValidationShown] = useState(false);
  const [recoveryEmailChecked, setRecoveryEmailChecked] = useState(false);
  const fields = { email, password, displayName, inviteCode, legalAccepted, username };
  const isForm = ['signin', 'signup', 'adult', 'child', 'child-signin'].includes(screen);
  const errors = validationShown && isForm ? validateAuthFields(screen as AuthEntryMode, fields) : {};
  const requiresLegalAcceptance = screen === 'signup' || screen === 'adult';
  const goTo = (next: WelcomeScreenMode) => {
    if (running.current) return;
    setScreen(next);
    setInviteCode('');
    setLegalAccepted(false);
    setPasswordVisible(false);
    setPassword('');
    setValidationShown(false);
    setRecoveryEmailChecked(false);
  };

  const submit = async () => {
    if (running.current || !isForm) return;
    setValidationShown(true);
    if (hasFieldErrors(validateAuthFields(screen as AuthEntryMode, fields))) return;
    Keyboard.dismiss();
    running.current = true;
    setBusy(true);
    try {
      const result = await performAuthEntry(screen as AuthEntryMode, { email, password, displayName, inviteCode, legalAccepted, username }, {
        signIn: auth.signIn,
        signInChild: auth.signInChild,
        signUp: (address, secret, name, code) => auth.signUp(address, secret, name, createCurrentLegalAcceptance(), code),
        createChildAccount: auth.createChildAccount,
        savePendingAdultInvite, clearPendingAdultInvite,
      });
      if (result.needsEmailConfirmation) {
        setScreen('confirmation');
        setPassword('');
        setLegalAccepted(false);
      }
    } catch (error) {
      Alert.alert(screen === 'child' ? 'Could Not Connect Your Profile' : screen === 'signin' ? 'Could Not Sign In' : 'Could Not Create Account', error instanceof Error ? error.message : String(error));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    if (running.current) return;
    setRecoveryEmailChecked(true);
    if (validateEmail(email)) return;
    running.current = true;
    setBusy(true);
    try {
      await auth.resetPassword(email);
      Alert.alert('Email Sent', 'Check your inbox for a password-reset link.');
    } catch (error) { Alert.alert('Could Not Send Email', error instanceof Error ? error.message : String(error)); }
    finally { running.current = false; setBusy(false); }
  };

  const title = screen === 'welcome' ? 'Welcome!' : screen === 'child-options' ? 'Your Kudos Adventure' : screen === 'child-signin' ? 'Child Sign In' : screen === 'adult-options' ? 'Let’s get started' : screen === 'child' ? 'Enter Family Code' : screen === 'signin' ? 'Sign In' : screen === 'adult' ? 'Join an Existing Family' : screen === 'confirmation' ? 'Check Your Email' : 'Create Account';
  const back = screen === 'signup' || screen === 'adult' ? 'adult-options' : screen === 'child' || screen === 'child-signin' ? 'child-options' : 'welcome';
  const submitDisabled = busy || (requiresLegalAcceptance && !legalAccepted);
  return <SafeAreaView style={styles.root}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.compactBrand}>
          <Text style={styles.brandEyebrow}>LITTLE WINS. BIG POSSIBILITIES.</Text>
          <View style={styles.compactLogoFrame}>
            <Image accessibilityLabel="Kudos Family logo" resizeMode="contain" source={require('../../assets/branding/kudos-star-laurel.png')} style={styles.compactLogo} />
          </View>
          <Image accessibilityLabel="Kudos Family" resizeMode="contain" source={require('../../assets/branding/kudos-family-wordmark.png')} style={styles.compactWordmark} />
          <Text style={styles.welcomeTagline}>Make everyday accomplishments count.</Text>
        </View>
        <View style={[styles.card, styles.authCard, screen === 'welcome' && styles.welcomeContent]}>
          <View style={styles.headingGroup}>
            {screen !== 'welcome' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => goTo(back)} style={styles.backButton}><Text style={styles.backText}>‹ Back</Text></Pressable> : null}
            <Text accessibilityRole="header" style={styles.screenTitle}>{title}</Text>
          </View>
          {screen === 'welcome' ? <>
            <Text style={styles.screenDescription}>How would you like to get started?</Text>
            <Pressable accessibilityRole="button" onPress={() => goTo('adult-options')} style={({ pressed }) => [styles.welcomeChoice, styles.adultWelcomeChoice, pressed && styles.choicePressed]}>
              <View style={styles.choiceCopy}>
              <Text style={styles.welcomeChoiceTitle}>I'm a Parent or Adult</Text>
              <Text style={styles.welcomeChoiceHint}>Create a family or join an existing one</Text>
              <Text style={styles.classroomHint}>Teachers can create a classroom, too.</Text>
              </View><Text style={styles.choiceArrow}>›</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => goTo('child-options')} style={({ pressed }) => [styles.welcomeChoice, pressed && styles.choicePressed]}>
              <View style={styles.choiceCopy}>
              <Text style={styles.welcomeChoiceTitle}>I'm a Child</Text>
              <Text style={styles.welcomeChoiceHint}>Sign in or connect with your parent’s code</Text>
              </View><Text style={styles.choiceArrow}>›</Text>
            </Pressable>
            <Text style={styles.existingAccount}>Already have an account?</Text>
            <Pressable accessibilityRole="button" onPress={() => goTo('signin')} style={styles.textButton}><Text style={styles.link}>Sign In</Text></Pressable>
          </> : screen === 'child-options' ? <>
            <Text style={styles.screenDescription}>Your own profile. Your own progress.</Text>
            <Pressable accessibilityRole="button" onPress={() => goTo('child-signin')} style={styles.primary}><Text style={styles.primaryText}>Child Sign In</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => goTo('child')} style={styles.secondaryButton}><Text style={styles.link}>I Have a Parent Code</Text></Pressable>
            <Text style={styles.setupHint}>First time? Use your code to connect your profile, then choose your login.</Text>
          </> : screen === 'adult-options' ? <>
            <Text style={styles.screenDescription}>Choose the option that’s right for you.</Text>
            <Pressable accessibilityRole="button" onPress={() => goTo('signup')} style={({ pressed }) => [styles.welcomeChoice, styles.adultWelcomeChoice, styles.setupChoice, pressed && styles.choicePressed]}>
              <Text style={styles.welcomeChoiceTitle}>Create a New Family</Text>
              <Text style={styles.welcomeChoiceHint}>Set up your own family or classroom.</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => goTo('adult')} style={({ pressed }) => [styles.welcomeChoice, styles.setupChoice, pressed && styles.choicePressed]}>
              <Text style={styles.welcomeChoiceTitle}>Join an Existing Family</Text>
              <Text style={styles.welcomeChoiceHint}>Use the adult invitation code sent to your email.</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => goTo('signin')} style={styles.textButton}><Text style={styles.link}>Already registered? Sign In</Text></Pressable>
          </> : screen === 'confirmation' ? <>
            <Text style={styles.screenDescription}>Confirm your email address using the link sent to {email.trim()}, then return here to sign in.</Text>
            <Text style={styles.setupHint}>If you used an adult invitation code, Kudos will open the family you joined. Otherwise, you’ll name your new family or classroom next.</Text>
            <Pressable accessibilityRole="button" onPress={() => goTo('signin')} style={styles.primary}><Text style={styles.primaryText}>Go to Sign In</Text></Pressable>
          </> : <>
            <Text style={styles.screenDescription}>{screen === 'child-signin' ? 'Welcome back! Sign in with your username and password.' : screen === 'child' ? 'Connect to the profile your parent already created for you. Next, choose your own login. No email needed.' : screen === 'signin' ? 'Welcome back. Sign in to your adult account.' : screen === 'adult' ? 'Create your adult login using the email address that received the invitation.' : 'Your adult account can manage a family and a classroom.'}</Text>
            {screen === 'child' ? <>
              <Text style={styles.fieldLabel}>Family code</Text>
              <TextInput accessibilityLabel="Family code" editable={!busy} autoCapitalize="characters" autoCorrect={false} maxLength={12} onChangeText={setInviteCode} placeholder="Enter your code" placeholderTextColor="#9493A5" style={styles.input} value={inviteCode} returnKeyType="go" submitBehavior="submit" onSubmitEditing={() => void submit()} />
              <FieldError message={errors.inviteCode} />
              <Text style={styles.setupHint}>Don’t have a code? Ask your parent to open Settings → Account in Kudos Family and generate a code for your profile.</Text>
            </> : <>
              {requiresLegalAcceptance ? <><Text style={styles.fieldLabel}>Your name</Text><TextInput accessibilityLabel="Your name" editable={!busy} autoCapitalize="words" autoComplete="name" onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor="#9493A5" style={styles.input} value={displayName} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => emailRef.current?.focus()} /></> : null}
              <FieldError message={errors.displayName} />
              <Text style={styles.fieldLabel}>{screen === 'child-signin' ? 'Username' : screen === 'adult' ? 'Invited email address' : 'Email address'}</Text>
              {screen === 'child-signin' ? <TextInput accessibilityLabel="Child username" editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={24} onChangeText={setUsername} placeholder="Your username" style={styles.input} value={username} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} /> : <TextInput ref={emailRef} accessibilityLabel="Email address" editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#9493A5" style={styles.input} value={email} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} />}
              <FieldError message={screen === 'child-signin' ? errors.username : errors.email ?? (recoveryEmailChecked ? validateEmail(email) : undefined)} />
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.passwordWrap}><TextInput ref={passwordRef} accessibilityLabel="Password" editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete={screen === 'signin' || screen === 'child-signin' ? 'current-password' : 'new-password'} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#9493A5" secureTextEntry={!passwordVisible} style={styles.passwordInput} value={password} returnKeyType={screen === 'adult' ? 'next' : 'go'} submitBehavior="submit" onSubmitEditing={() => { if (screen === 'adult') inviteRef.current?.focus(); else void submit(); }} /><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'} hitSlop={8} onPress={() => setPasswordVisible((value) => !value)} style={styles.passwordToggle}><Text style={styles.passwordToggleText}>{passwordVisible ? 'Hide' : 'Show'}</Text></Pressable></View>
              <FieldError message={errors.password} />
              {screen === 'adult' ? <><Text style={styles.fieldLabel}>Adult invitation code</Text><TextInput ref={inviteRef} accessibilityLabel="Adult invitation code" editable={!busy} autoCapitalize="characters" autoCorrect={false} maxLength={12} onChangeText={setInviteCode} placeholder="Code from your invitation email" placeholderTextColor="#9493A5" style={styles.input} value={inviteCode} returnKeyType="go" submitBehavior="submit" onSubmitEditing={() => void submit()} /></> : null}
              <FieldError message={errors.inviteCode} />
            </>}
            {requiresLegalAcceptance ? <View style={styles.legalRow}><Pressable disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: legalAccepted }} hitSlop={7} onPress={() => setLegalAccepted((accepted) => !accepted)} style={[styles.checkbox, legalAccepted && styles.checkboxChecked]}><Text style={styles.checkmark}>{legalAccepted ? '✓' : ''}</Text></Pressable><Text style={styles.legalText}>I accept the <Text onPress={() => void Linking.openURL(TERMS_URL)} style={styles.legalLink}>Terms of Service</Text> and the <Text onPress={() => void Linking.openURL(PRIVACY_URL)} style={styles.legalLink}>Privacy Policy</Text>.</Text></View> : null}
            <FieldError message={errors.legalAccepted} />
            <Pressable accessibilityRole="button" disabled={submitDisabled} onPress={() => void submit()} style={[styles.primary, submitDisabled && styles.disabled]}><Text style={styles.primaryText}>{busy ? screen === 'child' ? 'Connecting your profile…' : 'Please wait…' : screen === 'child' ? 'Continue' : screen === 'signin' || screen === 'child-signin' ? 'Sign In' : screen === 'adult' ? 'Create Account & Join Family' : 'Create Account'}</Text></Pressable>
            {screen === 'child-signin' ? <Text style={styles.setupHint}>Forgot your login? Ask your parent to reset it in Settings → Account. No email needed.</Text> : null}
            {screen === 'signup' ? <Text style={styles.setupHint}>Next: confirm your email, then name your family or classroom.</Text> : null}
            {screen === 'signin' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void forgotPassword()} style={styles.textButton}><Text style={styles.link}>Forgot password?</Text></Pressable> : null}
          </>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function PasswordRecoveryScreen() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [validationShown, setValidationShown] = useState(false);
  const errors = validationShown ? validatePasswordConfirmation(password, confirmation) : {};
  const confirmationRef = useRef<TextInput>(null);
  const running = useRef(false);
  const save = async () => {
    if (running.current) return;
    setValidationShown(true);
    if (hasFieldErrors(validatePasswordConfirmation(password, confirmation))) return;
    running.current = true;
    Keyboard.dismiss();
    setBusy(true);
    try {
      await auth.updatePassword(password);
      Alert.alert('Password Updated', 'Your new password is ready to use.');
    } catch (error) {
      Alert.alert('Could Not Update Password', error instanceof Error ? error.message : String(error));
    } finally { running.current = false; setBusy(false); }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.brand}><Image resizeMode="contain" source={require('../../assets/branding/kudos-star-laurel.png')} style={styles.logo}/><Text style={styles.recoveryTitle}>Create a new password</Text><Text style={styles.tagline}>Use at least 8 characters for your parent account.</Text></View>
      <View style={styles.card}>
        <TextInput accessibilityLabel="New password" editable={!busy} autoCapitalize="none" onChangeText={setPassword} placeholder="New password" placeholderTextColor="#9493A5" secureTextEntry style={styles.input} value={password} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmationRef.current?.focus()} />
        <FieldError message={errors.password} />
        <TextInput ref={confirmationRef} accessibilityLabel="Confirm new password" editable={!busy} autoCapitalize="none" onChangeText={setConfirmation} placeholder="Confirm new password" placeholderTextColor="#9493A5" secureTextEntry style={styles.input} value={confirmation} returnKeyType="go" submitBehavior="submit" onSubmitEditing={() => void save()} />
        <FieldError message={errors.confirmation} />
        <Pressable disabled={busy} onPress={() => void save()} style={[styles.primary,busy&&styles.disabled]}><Text style={styles.primaryText}>{busy?'Updating…':'Update password'}</Text></Pressable>
        <Pressable disabled={busy} onPress={() => void auth.cancelPasswordRecovery()}><Text style={styles.link}>Cancel and return to sign in</Text></Pressable>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  brandEyebrow: { color:'#A47914',fontSize:10,fontWeight:'800',letterSpacing:1.5,marginBottom:10,textAlign:'center' },
  choiceCopy: { flex:1 },choiceArrow: { fontSize:30,color:'#A47914',marginLeft:6 },
  setupChoice: { flexDirection:'column',alignItems:'flex-start' },
  secondaryButton: { borderWidth:1.5,borderColor:'#AED7CD',backgroundColor:'#EDF7F3',borderRadius:16,padding:16,minHeight:52,justifyContent:'center' },
  compactBrand: { alignItems: 'center', marginBottom: 16 },
  compactLogo: { height: 68, width: 68 },
  // Clip the image's baked-in white corners without changing the brand artwork.
  compactLogoFrame: { height: 68, width: 68, borderRadius: 15, overflow: 'hidden' },
  welcomeContent: { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0, paddingTop: 24 },
  compactWordmark: { height: 52, width: 235 },
  welcomeTagline: { color: '#5F7475', fontSize: 13, textAlign: 'center', marginTop: 2 },
  authCard: { padding: 24, paddingTop: 8 },
  headingGroup: { gap: 4 },
  screenTitle: { color: '#183437', fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center' },
  screenDescription: { color: '#5F7475', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 4, marginBottom: 4 },
  welcomeChoice: { backgroundColor: '#EDF7F3', borderColor: '#D5E9E4', borderWidth: 1.5, borderRadius: 20, padding: 17, minHeight: 106, justifyContent: 'center',flexDirection:'row',alignItems:'center',shadowColor:'#163D38',shadowOpacity:0.07,shadowRadius:10,shadowOffset:{width:0,height:5},elevation:2 },
  adultWelcomeChoice: { backgroundColor: '#FFF8E3', borderColor: '#D6A727' },
  welcomeChoiceTitle: { color: '#0B756F', fontSize: 18, fontWeight: '900' },
  welcomeChoiceHint: { color: '#5F7475', fontSize: 13, lineHeight: 19, marginTop: 5 },
  classroomHint: { color: '#5F7475', fontSize: 11, lineHeight: 16, marginTop: 5 },
  choicePressed: { opacity: 0.7 },
  existingAccount: { color: '#5F7475', fontSize: 12, textAlign: 'center', marginTop: 7 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 9 },
  backButton: { alignSelf: 'flex-start', minHeight: 44, minWidth: 64, marginLeft: -12, justifyContent: 'center' },
  backText: { color: '#0B756F', fontSize: 14, fontWeight: '800' },
  fieldLabel: { color: '#183437', fontSize: 12, fontWeight: '800', marginTop: 2 },
  setupHint: { color: '#5F7475', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 4 },
  root:{backgroundColor:'#E5F4F0',flex:1},content:{alignItems:'center',flexGrow:1,justifyContent:'center',padding:22},
  brand:{alignItems:'center',marginBottom:22},logo:{height:82,width:82},brandWordmark:{height:82,marginTop:-2,width:270},tagline:{color:'#5F7475',fontSize:14,marginTop:-5},
  recoveryTitle:{color:'#183437',fontSize:27,fontWeight:'900',marginBottom:10,marginTop:12},
  card:{backgroundColor:'#FFF',borderColor:'#D5E9E4',borderRadius:27,borderWidth:1,gap:10,maxWidth:480,padding:22,width:'100%'},tabs:{backgroundColor:'#EDF7F3',borderRadius:14,flexDirection:'row',marginBottom:4,padding:3},tab:{alignItems:'center',borderRadius:11,flex:1,padding:10},tabActive:{backgroundColor:'#2F9E91'},tabText:{color:'#5F7475',fontSize:13,fontWeight:'900'},tabTextActive:{color:'#FFF'},childChoice:{alignItems:'center',borderColor:'#D5E9E4',borderRadius:13,borderWidth:1,paddingVertical:7,paddingHorizontal:10},childChoiceActive:{backgroundColor:'#E3F8F3',borderColor:'#2F9E91'},childChoiceText:{color:'#2F9E91',fontSize:12,fontWeight:'900'},childChoiceHint:{color:'#5F7475',fontSize:10,marginTop:1},childHelp:{color:'#5F7475',fontSize:13,lineHeight:17,textAlign:'center'},input:{backgroundColor:'#F4FBF8',borderColor:'#D5E9E4',borderRadius:15,borderWidth:1,color:'#183437',fontSize:15,minHeight:52,paddingHorizontal:14},passwordWrap:{alignItems:'center',backgroundColor:'#F4FBF8',borderColor:'#D5E9E4',borderRadius:15,borderWidth:1,flexDirection:'row',minHeight:52},passwordInput:{color:'#183437',flex:1,fontSize:15,minHeight:50,paddingLeft:14,paddingRight:8},passwordToggle:{alignItems:'center',alignSelf:'stretch',justifyContent:'center',paddingHorizontal:14},passwordToggleText:{color:'#0B756F',fontSize:12,fontWeight:'900'},legalRow:{alignItems:'flex-start',flexDirection:'row',gap:9,paddingHorizontal:2,paddingVertical:2},checkbox:{alignItems:'center',borderColor:'#2F9E91',borderRadius:4,borderWidth:2,height:20,justifyContent:'center',marginTop:1,width:20},checkboxChecked:{backgroundColor:'#2F9E91'},checkmark:{color:'#FFF',fontSize:13,fontWeight:'900'},legalText:{color:'#5F7475',flex:1,fontSize:12,lineHeight:18},legalLink:{color:'#0B756F',fontWeight:'900',textDecorationLine:'underline'},primary:{alignItems:'center',backgroundColor:'#2F9E91',borderRadius:16,padding:16},primaryText:{color:'#FFF',fontSize:14,fontWeight:'900'},disabled:{opacity:0.45},link:{color:'#2F9E91',fontSize:13,fontWeight:'800',textAlign:'center'},
});
